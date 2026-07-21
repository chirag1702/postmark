# Postmark — Implementation Modules

Postmark is currently a **UI-only template**: every screen, interaction, and animation exists, but all data lives in one in-memory React context (`src/context/app-state-context.tsx`) seeded from `src/lib/mock-data.ts`. There is no database, no auth, and no network I/O — `LoginForm.tsx`/`SignupForm.tsx` accept any input and just `router.push("/mail")`, and "connecting a mailbox" fabricates a fake `avery.demo@{provider}.com` account client-side.

This document breaks the remaining work into modules. Implementing all of them turns the template into a fully working, real multi-mailbox email client with per-recipient read receipts — the product's core differentiator. Modules are **ordered by usefulness/impact**: the sequence that proves the core value proposition end-to-end as fast as possible, then fills in real inbound sync, then closes UI-parity gaps, then adds genuine enhancements.

Backend is built entirely on **Next.js Route Handlers** (`app/api/**/route.ts`) — no separate server, and (as of this revision) no separate background worker process either.

### Cross-cutting constraints (apply to every module below)

- **Auth & storage: Supabase.** Supabase Auth for user accounts/sessions, Supabase Postgres for all application data. No separate auth library, no separate database host.
- **Providers, for now: Google (Gmail) and Microsoft (Outlook) only.** iCloud/generic IMAP and Hotmail-specific work are natural future extensions of the same patterns (Hotmail is already a Microsoft Graph account under the hood) but are explicitly out of scope until later.
- **No paid services or paid tiers, anywhere.** Every module uses free/open-source tooling or a generous free tier — this includes Google Cloud Pub/Sub (Module 9) and Supabase Realtime (Module 8), both comfortably inside their free tiers at this product's scale. Supabase Storage (not S3/Vercel Blob) is used for attachment storage for the same reason.
- **No background job queue or worker process.** All backend work runs inside Vercel Route Handlers — either inline or deferred past the response with Next.js's `after()` API (`next/server`). Initial mailbox sync and push-subscription renewal are both triggered by user activity (connecting a mailbox, switching to it), not a schedule — there is no cron job anywhere in this design.
- **Validation:** every Route Handler validates input with `zod`.
- **Secrets:** PINs (`Mailbox.sendPin`/`lockPin`) and OAuth tokens are hashed/encrypted at rest (`bcrypt` or Postgres `pgcrypto` for PINs, `node:crypto` AES-256-GCM for OAuth tokens) — never stored in plaintext as the current mock does.
- **RLS:** every Supabase table is scoped to `auth.uid()` via Row-Level Security policies.

---

## Module 1 — Supabase Foundation: Auth & Database

**Why first:** nothing else can persist or be scoped to a real user without it.

**Description:** Stands up a Supabase project, wires real authentication, and replaces the single hardcoded `MASTER_USER` with real per-user accounts. Introduces the `profiles` and `mailboxes` tables (mailboxes start empty per new user — new signups correctly fall into the already-built `EmptyMailboxScreen.tsx` via `MainPanel.tsx`'s `mail.accounts.length === 0` branch until Module 2 ships). Adds real session-based route protection so `/mail/**` can't be reached without a valid session.

**Tech:** Supabase Auth (email/password) via `@supabase/supabase-js` + `@supabase/ssr` (cookie-based session handling in Route Handlers and `middleware.ts`); Supabase Postgres for storage.

**Wires up:**
- `src/components/auth/LoginForm.tsx` — replaces the `// TODO: real authentication` stub with `supabase.auth.signInWithPassword(...)`.
- `src/components/auth/SignupForm.tsx` — replaces the `// TODO: real account creation` stub with `supabase.auth.signUp(...)`.
- `src/app/(app)/mail/layout.tsx` — removes the `// TODO: add real auth check / middleware.ts` comment; a new `middleware.ts` at the repo root protects `/mail/**` using the Supabase session.
- `src/app/page.tsx` — becomes a session-aware redirect (`/mail` if authenticated, `/login` otherwise) instead of the current unconditional `redirect("/login")`.
- `src/context/app-state-context.tsx` — `createInitialMailState()`'s `// TODO: persist to backend` comment resolved: `user`/`accounts`/`emails` hydrate from API responses instead of `INITIAL_ACCOUNTS`/`INITIAL_EMAILS`/`MASTER_USER`.
- `src/components/account-switcher/AccountSwitcherPopover.tsx` — "Sign out" (currently `router.push("/login")`) becomes `supabase.auth.signOut()`.

**Data model additions:**
- `profiles(id UUID PK references auth.users, name, created_at, updated_at)`
- `mailboxes(id, user_id FK, email, provider ENUM('gmail','outlook'), is_default, send_pin_hash NULL, lock_pin_hash NULL, created_at)` — schema only; PIN set/verify flows land in Module 13.

**Key API routes:**
- `GET /api/user` — current user profile.
- `middleware.ts` (repo root) — protects `/mail/**`, bounces authenticated users away from `/login`/`/signup`.

---

## Module 2 — Gmail OAuth Connect + Native Send

**Why second:** the fastest path to one genuinely connected, real mailbox — everything from Module 3 onward needs at least one real mailbox to plug into.

**Description:** Real OAuth consent flow for Gmail, token storage, and native sending via the Gmail API. This is the first provider integration and deliberately the only one tackled before the tracking engine, so the core differentiator (Module 3) can be proven on top of one real send path before a second provider adds complexity.

**Tech:** `googleapis` (OAuth 2.0 authorization-code flow + `users.messages.send`, MIME built with `mailcomposer`); OAuth tokens encrypted with `node:crypto` AES-256-GCM before being stored in Supabase Postgres.

**Wires up:**
- `src/components/settings/ProviderConnectGrid.tsx` — the Gmail tile's fabricated `dispatch({ type: "ADD_ACCOUNT", account: { email: "avery.demo@gmail.com", ... } })` is replaced with a redirect to `/api/auth/connect/gmail`.
- `src/components/settings/MailboxCard.tsx` — "Unlink" now calls `DELETE /api/mailboxes/[id]` first.
- `src/components/settings/LinkedMailboxesTab.tsx` — mailbox list sourced from `GET /api/mailboxes` instead of client-only state.

**Data model additions:**
- `oauth_tokens(mailbox_id FK UNIQUE, provider, access_token_enc, refresh_token_enc, expires_at, scope)`

**Key API routes:**
- `GET /api/auth/connect/gmail` — starts the OAuth authorize redirect.
- `GET /api/auth/callback/gmail` — exchanges the code, fetches the profile email, creates `mailboxes` + `oauth_tokens` rows.
- `DELETE /api/mailboxes/[id]`, `GET /api/mailboxes`.

---

## Module 3 — Tracking Pixel & Click Engine (Read Receipts)

**Why third, before a second provider:** this is the single highest-value module in the product — "can I tell if my email was opened" is Postmark's whole reason to exist. Proving it end-to-end on the one real mailbox from Module 2 demonstrates the core value proposition before investing further in provider breadth.

**Description:** Persists composed emails, sends them for real through the Gmail path built in Module 2, and implements per-recipient read-receipt tracking. Because tracking must distinguish *which* recipient opened, the send path embeds a unique pixel and rewritten CTA link per recipient. Also fixes the currently unwired "Read receipt" checkbox — today `buildSentEmail` in `src/lib/utils.ts` always attaches a `tracking` object regardless of the checkbox state.

**Tech:** per-recipient tracking tokens; the pixel endpoint returns a real transparent 1×1 GIF buffer with `Cache-Control: no-store`.

**Wires up:**
- `src/components/compose/ComposeFooter.tsx` — `handleSend` stops calling local `buildSentEmail`/`dispatch({ type: "ADD_EMAIL" })` and instead `POST /api/mail/send`; the "Read receipt" checkbox (`ui.readReceiptDefault`) is now actually sent as `trackingEnabled` in the request body.
- `src/components/compose/SendPinModal.tsx` — the plaintext `pin !== account.sendPin` check moves server-side (`bcrypt.compare` against `mailboxes.send_pin_hash`, returns 403 on mismatch — PIN *setting* UI itself lands in Module 13).
- `src/components/reading-pane/EmailToolbar.tsx` — star/archive/trash switch from local `dispatch` to `PATCH /api/mail/[id]`.
- `src/components/mail-list/MailListPane.tsx`, `EmailList.tsx`, `src/components/reading-pane/ReadingPane.tsx` — email list/detail hydrate from `GET /api/mail`/`GET /api/mail/[id]` instead of `INITIAL_EMAILS`.
- `src/components/reading-pane/TrackingStatus.tsx` — "Opened by X of Y · Z clicked" now reflects real aggregated data.
- `src/lib/utils.ts` — `buildSentEmail`/tracking aggregation logic moves server-side; `trackingSummary` can stay client-side as a pure formatter over API-returned data.

**Data model additions:**
- `emails(id, mailbox_id FK, folder ENUM, subject, from_name, from_email, body_html, body_text, preview_text, cta_label, cta_href, sent_at, unread, starred, created_at)`
- `email_recipients(id, email_id FK, kind ENUM('to','cc','bcc'), name, email)`
- `tracking_tokens(id UUID, email_id FK, recipient_email, opened_at NULL, open_count INT DEFAULT 0, clicked_at NULL, click_count INT DEFAULT 0)`

**Key API routes:**
- `POST /api/mail/send` — persists `emails`/`email_recipients`, generates a `tracking_tokens` row per recipient when `trackingEnabled`, injects `<img src=".../api/track/open/[token]">`, rewrites `cta_href` to `.../api/track/click/[token]`, sends via the Gmail API.
- `GET /api/track/open/[token]` — public, unauthenticated, records `opened_at`/`open_count`, returns the pixel.
- `GET /api/track/click/[token]` — public, records the click, 302-redirects to the original CTA URL.
- `GET /api/mail?mailboxId=&folder=`, `GET /api/mail/[id]`, `PATCH /api/mail/[id]`.

---

## Module 4 — Microsoft Graph (Outlook) OAuth Connect + Native Send

**Description:** Extends the proven connect+send+tracking path from Modules 2–3 to Outlook, the second provider in scope. Reuses the tracking engine from Module 3 as-is — only the send transport changes.

**Tech:** `@azure/msal-node` for the OAuth authorization-code flow; Microsoft Graph REST `/me/sendMail`.

**Wires up:**
- `src/components/settings/ProviderConnectGrid.tsx` — the Outlook tile's fabrication is replaced with a redirect to `/api/auth/connect/microsoft`. (Hotmail and iCloud tiles remain disabled/"coming soon" — out of scope for now.)
- `POST /api/mail/send` (Module 3) gains a Graph branch alongside the Gmail branch.

**Data model additions:** none beyond Module 2's `oauth_tokens` (reused, `provider = 'outlook'`).

**Key API routes:**
- `GET /api/auth/connect/microsoft`, `GET /api/auth/callback/microsoft`.

---

## Module 5 — Provider Adapter Abstraction

**Description:** Generalizes the two send paths that exist ad hoc (Gmail from Module 2, Graph from Module 4) behind one `ProviderAdapter` interface (`sendMail`, `fetchMessages`, `fetchMessageBody`, `applyFlags`, `moveToFolder`), so every later module (sync, write-back, push renewal) calls one abstraction regardless of provider, instead of branching on `mailbox.provider` everywhere.

**Tech:** plain TypeScript interface + one implementation per provider (`src/lib/providers/gmail-adapter.ts`, `microsoft-adapter.ts`) selected via `getProviderAdapter(provider)`. No job queue, no separate worker process — every module built on this adapter runs inside a Vercel Route Handler, synchronously or deferred with `after()`.

**Wires up:** no direct UI wiring — pure backend/architecture module that unblocks Modules 6, 7, 9, and 10.

**Data model additions:**
- `sync_state(mailbox_id FK UNIQUE, provider, last_history_id NULL, last_delta_link NULL, last_synced_at, backfill_complete BOOLEAN, push_expires_at NULL, push_subscription_id NULL)` — provider-specific cursor storage (Gmail `historyId`, Graph `deltaLink`) and the provider's push-subscription bookkeeping (Modules 9/10), unified into one row shape. `backfill_complete` doubles as the "mailbox is ready to show real mail" flag Module 6 depends on.

**Key API routes:** none new.

---

## Module 6 — Inbound Sync: Initial Fetch on Connect

**Description:** Right after a mailbox is created (Module 2/4's OAuth callback), the mailbox needs *some* mail in it before it's useful, but pulling that inline in the callback risks Vercel's function duration limit on an account with real history, and blocks the OAuth redirect on network calls the user is just waiting on. Instead: the callback upserts `sync_state` with `backfill_complete = false` and, via `after()`, fires a request to a separate internal route that does the actual fetch after the callback has already redirected the user into the app. That route pages through the **last 10 days** of the mailbox's history (not the entire history — this product doesn't need exhaustive cross-provider search coverage for the MVP, see Module 11), normalizing and upserting each message via `processMessagePage`, sanitizing inbound HTML before storage. When it finishes, it flips `backfill_complete` to `true`. While a mailbox's `backfill_complete` is `false`, the UI shows a "Setting up your mailbox" state instead of its (empty/partial) mail list — mirroring the existing `MainPanel.tsx` pattern that already branches on `account.locked` for `LockedMailboxScreen`.

**Tech:** the Module 5 adapter's `fetchMessages({ mode: "backfill", cursor })`, paginated until either "no more pages" or the 10-day window is exhausted; `sanitize-html` for inbound HTML; Next.js `after()` (`next/server`) to defer the internal route call past the OAuth callback's redirect response.

**Wires up:**
- `src/app/api/auth/callback/gmail/route.ts`, `.../microsoft/route.ts` — after creating the mailbox, upsert `sync_state` with `backfill_complete = false`, then `after(() => fetch(internalSyncUrl, ...))` instead of the old `enqueueBackfillJob` call.
- `src/app/api/internal/sync/[mailboxId]/backfill/route.ts` — implementation swaps from enqueueing a job to doing the fetch-and-store work directly. Since it's now invoked server-to-server (no browser session on that request), it accepts either a valid user session (for a future manual "resync" button) or an internal shared-secret header (for the OAuth callback's own call) — the admin/service-role client, same as the webhook routes in Modules 9/10, does the actual writes.
- `src/components/shell/MainPanel.tsx` — gains a third branch alongside `EmptyMailboxScreen`/`LockedMailboxScreen`: a new "setting up" screen, shown when the active account's `sync_state.backfill_complete` is `false`.
- `src/components/account-switcher/AccountSwitcherPopover.tsx`/`src/components/settings/MailboxCard.tsx` — a small "setting up…" indicator next to a not-yet-ready mailbox, so it's visible outside the mail list too.
- `GET /api/mailboxes` — now also returns each mailbox's `backfill_complete` state so the UI can branch on it.

**Data model additions:**
- `emails` gains `provider_message_id` (unique per mailbox, for idempotent upsert during sync) and `thread_id` (nullable; forward-compatible column for future threading — no threading UI exists today, none is built here).
- `sync_state` (added in Module 5) is populated/updated here.

**Superseded:** this replaces what was originally planned as a backfill *job* plus a recurring 5-minute poll *schedule* — both required a background job queue/worker process. Ongoing new-mail sync now belongs entirely to Modules 9/10 (provider push), which are activity-renewed rather than scheduled, so no queue, worker, or cron job is needed anywhere in this pipeline.

**Key API routes:**
- `POST /api/internal/sync/[mailboxId]/backfill` — does the initial fetch-and-store (triggered right after Module 2/4's connect flow completes; also usable later as a manual "resync" trigger).
- `GET /api/mail` (from Module 3) now returns real synced data instead of only sent mail.

---

## Module 7 — Two-Way Mailbox Actions Sync

**Description:** Today `EmailToolbar.tsx`'s star/archive/trash and read-state changes only mutate the local DB (after Module 3). This module writes those actions back to the real Gmail/Outlook mailbox so the app stays consistent with what the user sees when they check mail elsewhere — required for a mail client to feel trustworthy. The provider call runs inside the same `PATCH /api/mail/[id]` Route Handler invocation, deferred past the response with Next.js `after()`, so the local write returns immediately without waiting on the Gmail/Graph round-trip — the UI updates optimistically, exactly as it would with a background job, just without one.

**Tech:** provider-specific write operations behind the Module 5 adapter — Gmail: `users.messages.modify` (label add/remove: `STARRED`, `UNREAD`; archive = remove `INBOX` label; trash = `users.messages.trash`); Graph: `PATCH /me/messages/{id}` for `isRead`/`flag`, `POST /me/messages/{id}/move` for archive/delete.

**Wires up:**
- `src/app/api/mail/[id]/route.ts` — the write-back call is now `after(() => adapter.applyFlags(...) / adapter.moveToFolder(...))`, calling the Module 5 adapter directly instead of enqueueing a job.
- `src/components/reading-pane/EmailToolbar.tsx` — star/archive/trash buttons' `PATCH /api/mail/[id]` calls (Module 3), unchanged from the caller's perspective.
- `src/components/mail-list/EmailListRow.tsx` — star toggle, same propagation.

**Data model additions:** none new; `emails.provider_message_id` (Module 6) makes the write-back addressable.

**Key API routes:** `PATCH /api/mail/[id]` (extended) — performs the local write and defers the provider write-back via `after()`, so the UI updates optimistically without blocking on the round-trip to Gmail/Graph.

---

## Module 8 — Live Client Updates via Supabase Realtime

**Why before the provider push modules:** Modules 9/10 write new mail into Postgres from a server-side webhook with no browser involved at all — something has to tell the open app to actually show it, and this is that something. It's also what makes Module 6's "Setting up your mailbox" screen flip to the real mail list the instant the initial fetch finishes, instead of waiting on a client poll.

**Description:** Replaces `useMailSync`'s 30-second polling loop with a live Postgres change-feed. The frontend subscribes to `INSERT`/`UPDATE` events on `emails` (and `sync_state`, for the Module 6 ready-flip) scoped to the user's own mailboxes via Supabase Realtime's RLS-aware channels, and refetches/merges the moment a change lands — no separate "signal" endpoint needed, since the database write itself *is* the signal.

**Tech:** Supabase Realtime (`@supabase/supabase-js` realtime client, already a dependency) — Postgres logical replication over a websocket, part of the same Supabase project/plan, no separate infra.

**Wires up:**
- `src/hooks/useMailSync.ts` — the `setInterval` poll is replaced with a Realtime channel subscription per active mailbox; initial load (`fetchAccountEmails`) is unchanged, it's only the "stay current" half that changes transport.
- `src/components/shell/MainPanel.tsx` (Module 6) — the "setting up" screen listens for its mailbox's `sync_state` row flipping `backfill_complete: true` and swaps to the normal mail view live, instead of waiting for the next poll.
- `src/components/reading-pane/TrackingStatus.tsx` — open/click counts (Module 3) can ride the same channel for a live-updating dot, since it's the same mechanism, not additional scope.

**Data model additions:** none new; requires enabling Realtime replication on the `emails` and `sync_state` tables (a Supabase project setting, not a migration).

**Key API routes:** none — this is a client-to-Supabase channel, not a Next.js route.

---

## Module 9 — Gmail Push Sync (Pub/Sub Watch)

**Description:** Replaces polling with Gmail telling us the moment a mailbox changes. Right after Module 6's initial fetch completes (and again whenever renewed), the mailbox is registered via `users.watch()` against a Google Cloud Pub/Sub topic; Gmail then publishes a notification to that topic on every change, Pub/Sub delivers it as an HTTP POST to our webhook, and the webhook does the same incremental fetch Module 6's poll-mode adapter call already knows how to do — just triggered by a push instead of a timer. Because it's registered per mailbox and expires (~7 days), renewal is triggered by user activity rather than a schedule: when the user switches to a mailbox in the UI, the app checks that mailbox's `push_expires_at`, and if it's within the next 12 hours, calls `users.watch()` again to extend it. If the subscription is found already expired and re-registering fails because the stored refresh token is no longer valid, the UI shows a blurred-background "reconnect this mailbox" dialog rather than silently failing.

**Tech:** `googleapis` `users.watch()`/`users.stop()`; a Google Cloud Pub/Sub topic with the Gmail push service account (`gmail-api-push@system.gserviceaccount.com`) granted publish access, and a push subscription on that topic targeting our webhook — both free-tier at this scale. Webhook authenticity verified via the Pub/Sub push subscription's OIDC token.

**Wires up:**
- Wherever `activeAccountId` changes (`src/components/account-switcher/`) — switching to a Gmail mailbox triggers a lightweight `POST /api/mailboxes/[id]/ensure-fresh` call (shared with Module 10; branches on `provider` internally).
- A new "reconnect this mailbox" modal (no current component covers this) — blurred background, mirrors `LockedMailboxScreen`'s full-panel takeover pattern, triggered when renewal reports the mailbox's grant is dead.

**Data model additions:** none beyond Module 5's `sync_state.push_expires_at` (Gmail's watch state is mailbox-scoped, not subscription-scoped, so `push_subscription_id` is unused here — it's populated by Module 10 only).

**Key API routes:**
- `POST /api/webhooks/gmail` — public, verifies the Pub/Sub OIDC token, looks up the mailbox by the notification's `emailAddress`, runs the same `fetchMessages({ mode: "poll" })` path Module 6 already implements, checkpoints `sync_state`.
- `POST /api/mailboxes/[id]/ensure-fresh` — shared with Module 10; for a Gmail mailbox, renews via `users.watch()` if `push_expires_at` is within 12h, or reports `needs_reconnect` if the refresh token is dead.

---

## Module 10 — Outlook Push Sync (Graph Subscriptions)

**Description:** The same push upgrade as Module 9, for Outlook. A Microsoft Graph subscription (`resource: /me/messages`, `changeType: created`) is created pointing at our webhook; unlike Gmail, this needs no separate broker (Graph posts directly), but it also expires much sooner (~3 days max) and requires a validation handshake at creation time (Graph calls the webhook URL with a `validationToken` that must be echoed back as plain text within 10 seconds). Renewal follows the identical activity-triggered pattern from Module 9: checked on mailbox switch, renewed if `push_expires_at` is within 12h, reconnect-prompted if the grant is dead.

**Tech:** Microsoft Graph `/subscriptions` REST endpoint (create/`PATCH`/delete); a `clientState` secret stored alongside the subscription and verified on every incoming notification, since Graph (unlike Pub/Sub) has no built-in request-signing.

**Wires up:**
- Same `POST /api/mailboxes/[id]/ensure-fresh` route as Module 9, Outlook branch.
- Same reconnect-modal component as Module 9 (provider-agnostic once built).

**Data model additions:** none beyond Module 5's `sync_state.push_expires_at`/`push_subscription_id` (both used here — Graph subscriptions are addressed by id for renewal/deletion, unlike Gmail's mailbox-scoped watch).

**Key API routes:**
- `POST /api/webhooks/microsoft` — public; handles the `validationToken` handshake on subscription creation, verifies `clientState` on real notifications, looks up the mailbox by `subscriptionId`, runs the adapter's `fetchMessages({ mode: "poll" })` path, checkpoints `sync_state`.
- `POST /api/mailboxes/[id]/ensure-fresh` — Outlook branch: `PATCH /subscriptions/{id}` with a new `expirationDateTime` if renewing, or reports `needs_reconnect`.

---

## Module 11 — Server-Side Cross-Account Search

**Description:** Replaces `getVisibleEmails`'s client-side substring match (`src/lib/utils.ts`, scoped to the single active account+folder) with real server-side search across **all** of the user's connected mailboxes at once — closing the explicitly-noted gap that today's search never searches cross-account.

**Tech:** Postgres full-text search (`tsvector` generated column over subject/preview/body) plus `pg_trgm` for fuzzy/substring matching on sender name/email — both native to Supabase Postgres, no extra service.

**Wires up:**
- `src/components/mail-list/SearchBar.tsx` — `dispatch({ type: "SET_SEARCH" })` gains a debounced `GET /api/mail/search?q=` call; when a query is active, results are no longer scoped by `activeAccountId`/`activeFolderId`.
- `src/components/mail-list/EmailListRow.tsx`/`MailListPane.tsx` — cross-account result rows need an account/folder indicator that doesn't exist today (flagged new UI affordance).

**Data model additions:** `emails` gains a generated `search_vector tsvector` column + GIN index; `pg_trgm` extension enabled.

**Key API routes:** `GET /api/mail/search?q=&scope=all|account`.

---

## Module 12 — Drafts Autosave

**Description:** The `drafts` folder exists as an enum value and mock seed (`e7` in `INITIAL_EMAILS`) but nothing auto-saves drafts today. This module periodically persists in-progress compose state and lets a draft be reopened for editing.

**Tech:** debounced client-side autosave hook (plain `useEffect` + `setTimeout`, no new library needed).

**Wires up:**
- `src/components/compose/ComposeDrawer.tsx`, `ComposeFields.tsx`, `ComposeBody.tsx` — draft fields debounce-save via `PATCH /api/mail/drafts/[id]` (or `POST` on first keystroke to obtain an id).
- `src/components/mail-list/EmailListRow.tsx`/`MailListPane.tsx` — **new behavior**: clicking a row in the `drafts` folder must reopen `ComposeDrawer` prefilled instead of the current every-row-does-`SELECT_EMAIL`-into-`ReadingPane` behavior.

**Data model additions:** none beyond `emails` with `folder = 'drafts'` (reuses Module 3's schema).

**Key API routes:** `POST /api/mail/drafts`, `PATCH /api/mail/drafts/[id]`, `DELETE /api/mail/drafts/[id]`.

---

## Module 13 — Mailbox Security: Send PIN & Lock PIN Persistence

**Description:** Makes the per-mailbox Send PIN and Lock PIN features (unique to this app) real and hashed, replacing the plaintext `sendPin`/`lockPin` strings in the mock. Also fixes a real design gap in the current mock: `Mailbox.locked` is a persistent boolean, meaning once unlocked it would stay unlocked forever. This module deliberately makes "unlocked" **session-scoped** (a JWT claim or a `session_unlocks` table), not a DB column, so a mailbox re-locks on every new login — matching what the mock's locked-Hotmail-by-default entry implies.

**Tech:** `bcrypt` (or Postgres `pgcrypto`) for `send_pin_hash`/`lock_pin_hash`.

**Wires up:**
- `src/components/settings/MailboxCard.tsx`, `PinEditPanel.tsx`, `SecurityToggleRow.tsx` — `dispatch({ type: "SET_ACCOUNT_SEND_PIN" / "SET_ACCOUNT_LOCK_PIN" })` replaced with `PATCH /api/mailboxes/[id]/send-pin` / `.../lock-pin`.
- `src/components/shell/LockedMailboxScreen.tsx` — the client-side `pin === account.lockPin` compare replaced with `POST /api/mailboxes/[id]/unlock`, which sets the session-scoped unlock and returns success/failure.
- `src/components/compose/SendPinModal.tsx` — already posts `pin` to `POST /api/mail/send` (Module 3); no change needed, just confirms the hash it's checked against is now settable.

**Data model additions:** `session_unlocks(session_id, mailbox_id, unlocked_at)` (or a session claim `unlockedMailboxIds: string[]`).

**Key API routes:** `PATCH /api/mailboxes/[id]/send-pin`, `PATCH /api/mailboxes/[id]/lock-pin`, `POST /api/mailboxes/[id]/unlock`.

---

## Module 14 — Settings & Account Persistence

**Description:** Makes the Account and Security settings tabs actually persist, closing two explicitly-noted gaps: `AccountTab.tsx`'s name/email edit is local-only, and `SecurityTab.tsx`'s password change doesn't touch anything real.

**Tech:** `supabase.auth.updateUser` for password change (with current-password re-verification); `profiles` table for name.

**Wires up:**
- `src/components/settings/AccountTab.tsx` — `dispatch({ type: "UPDATE_USER", patch: { name, loginEmail: email } })` replaced with `PATCH /api/user`.
- `src/components/settings/SecurityTab.tsx` — the fake `setStatus({ message: "Password updated." })` (which never checks `current` against anything real) replaced with a real Supabase password-update call that genuinely verifies `current` and surfaces real errors.

**Data model additions:** none beyond `profiles` (Module 1).

**Key API routes:** `PATCH /api/user`, `PATCH /api/user/password`.

---

## Module 15 — Attachments

**Description:** Adds attachment support end to end: outbound compose attachments, inbound attachment display/download. Currently there is no attachment field anywhere in `Email`/`EmailCta` and no UI for it, so this is new surface area, not a wiring fix. Required for a "fully working" email client, but nothing else in the app depends on it, so it trails the core send/sync/tracking loop and the UI-parity fixes above.

**Tech:** **Supabase Storage** (included in the Supabase free tier — no S3/Vercel Blob) for upload/download; multipart upload handled via `request.formData()` in a Route Handler.

**Wires up:**
- `src/components/compose/ComposeFields.tsx`/a new `ComposeAttachments.tsx` — new file upload UI (doesn't exist today).
- `src/components/reading-pane/EmailDetail.tsx` — new attachment-chip list rendering.
- Module 3's `POST /api/mail/send` — extended to attach files via Gmail raw MIME parts / Graph `attachments` array.
- Module 6's initial-fetch and Modules 9/10's push-sync webhooks — extended to pull attachment parts whenever a message is fetched (Gmail `payload.parts`, Graph `/attachments`).

**Data model additions:** `attachments(id, email_id FK, filename, mime_type, size_bytes, storage_key, created_at)`.

**Key API routes:** `POST /api/mail/attachments` (uploads to Supabase Storage), `GET /api/attachments/[id]` (auth-checked download/signed URL).

---

## Module 16 — Contacts / Address Book *(stretch)*

**Description:** Today `parseAddressList` (`src/lib/utils.ts`) naively derives a display name from the local-part of whatever's typed — there's no address book, no autocomplete, no contact history. This module adds one, derived automatically from synced/sent mail plus manual entry. The product is fully functional without it; this is a convenience layer over an already-working naive parser.

**Tech:** no new external dependency — Postgres table + a client-side combobox built with existing UI primitives.

**Wires up:**
- `src/components/compose/ComposeFields.tsx` — To/Cc/Bcc inputs gain an autocomplete dropdown (new component), replacing the current bare `<input>` fields.

**Data model additions:** `contacts(id, user_id FK, name, email, last_used_at, use_count)`.

**Key API routes:** `GET /api/contacts?q=`, `POST /api/contacts`. Contacts are upserted from `email_recipients`/sent mail inline via `after()` after each sync/send/webhook fetch — not a background job queue (there isn't one; see cross-cutting constraints).

---

## Module 17 — Notifications *(stretch)*

**Description:** No notification system exists today. Adds in-app and browser-level notification of new mail. The baseline is already covered by Module 8's Realtime channel; this module is a pure UX enhancement on top of it.

**Tech:** baseline: react to the same Supabase Realtime channel Module 8 already subscribes to; enhancement: Web Push (`web-push` npm package, VAPID keys — free, no paid push service) for OS-level notifications when the tab isn't focused.

**Wires up:** `src/components/shell/Sidebar.tsx`/`FolderNav.tsx` badges (already show unread counts, but from local state — Module 8 makes them live), plus a new toast/notification affordance (no current component covers this).

**Data model additions:** `push_subscriptions(id, user_id FK, endpoint, keys_json)` if Web Push is implemented.

**Key API routes:** `POST /api/push/subscribe`.

---

# Ordering Rationale

The order above optimizes for **fastest path to a working product with the core differentiator (read-receipt tracking) proven early**, not pure dependency order:

1. **Module 1 (Supabase auth + DB) must be first** — nothing else can persist or be scoped to a real user without it.
2. **Module 2 (Gmail connect + send)** — the fastest way to get one real, working mailbox, scoped to a single provider to keep it fast.
3. **Module 3 (tracking pixel/click engine) comes before a second provider** — this is the single highest-value module in the product, and it's provider-agnostic once one mailbox exists. Shipping it third proves the core value prop end-to-end before investing in provider breadth or the largest remaining effort (inbound sync).
4. **Module 4 (Outlook/Graph connect + send)** — extends the proven send+tracking path to the second provider in scope.
5. **Module 5 (adapter abstraction)** is placed right before sync because by this point two ad hoc send paths exist and need consolidating — no job queue this time, since nothing in the new design needs one.
6. **Module 6 (initial fetch on connect)** replaces what would otherwise be a background backfill job with a synchronous-but-deferred fetch, bounded to 10 days of history, so it can't blow past Vercel's function duration limit and doesn't need a queue to stay off the OAuth redirect's critical path.
7. **Module 7 (two-way action sync)** follows because messages need to exist locally (Module 6) before their star/archive/trash state can be meaningfully written back; `after()` replaces the queue here too.
8. **Module 8 (Realtime client updates)** comes right after, since Modules 9/10's whole value — "instant" — depends on the browser actually finding out when the push modules write new mail server-side.
9. **Modules 9–10 (Gmail Pub/Sub, Outlook Graph subscriptions)** are the required replacement for polling, split one-per-provider since the setup/renewal mechanics are entirely provider-specific (Pub/Sub topic vs. Graph subscription + validation handshake).
10. **Modules 11–14 (search, drafts, PIN persistence, settings persistence)** are UI-parity fixes for gaps explicitly present in the current codebase (no cross-account search, no draft autosave, plaintext PINs, dead password-change form). None of them block another module, so they're grouped together.
11. **Module 15 (attachments)** is real, required product functionality but nothing else depends on it, so it's placed after the UI-parity fixes despite being more work than any single module in the 11–14 group.
12. **Modules 16–17 (contacts, notifications)** are last because the product is fully functional without them — genuine enhancements over an already-complete baseline.

---

# Required vs. Stretch

**Required for "fully working product":** Modules 1–15 — auth, real mailbox connect for both provider families in scope, real send, the tracking-pixel/click differentiator, initial inbound sync, provider push sync for both providers with activity-triggered renewal, live client updates, two-way action sync, search, drafts, PIN security, settings persistence, attachments.

**Stretch / nice-to-have — product is complete without them:**
- **Module 16 (Contacts/address book)** — today's `parseAddressList` naive local-part derivation is functional, if unpolished; an address book is a convenience layer.
- **Module 17 (Notifications)** — Module 8's live unread counts are already sufficient for correctness; push notifications are a UX enhancement on top.
- Within Module 11 (search), the cross-account result disambiguation UI (showing which mailbox/folder a result belongs to) is flagged inline as net-new UI, not just a backend wiring change — small effort, but worth calling out.
- **Conversation threading** is intentionally excluded from the module list — there's no `thread_id`-driven grouped UI anywhere in the current component tree, `Reply` in `EmailToolbar.tsx` only prefills a fresh compose draft with no reference to the original message, and it wasn't requested. `emails.thread_id` is included in Module 6's schema only as a forward-compatible column, so this remains an easy true stretch add later.
- **iCloud/generic IMAP and Hotmail-specific work** are natural extensions of Modules 2/4's patterns (Hotmail is already a Microsoft account under Graph) but are explicitly deferred — out of scope for the current provider set (Gmail + Outlook only).

---

### Critical files referenced throughout

- `src/context/app-state-context.tsx`
- `src/lib/mock-data.ts`
- `src/lib/utils.ts`
- `src/types/index.ts`
- `src/components/compose/ComposeFooter.tsx`
- `src/app/(app)/mail/layout.tsx`
- `src/lib/providers/types.ts`
- `src/hooks/useMailSync.ts`
- `src/lib/sync/sync-state.ts`
