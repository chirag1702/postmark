# Postmark — Implementation Modules

Postmark is currently a **UI-only template**: every screen, interaction, and animation exists, but all data lives in one in-memory React context (`src/context/app-state-context.tsx`) seeded from `src/lib/mock-data.ts`. There is no database, no auth, and no network I/O — `LoginForm.tsx`/`SignupForm.tsx` accept any input and just `router.push("/mail")`, and "connecting a mailbox" fabricates a fake `avery.demo@{provider}.com` account client-side.

This document breaks the remaining work into modules. Implementing all of them turns the template into a fully working, real multi-mailbox email client with per-recipient read receipts — the product's core differentiator. Modules are **ordered by usefulness/impact**: the sequence that proves the core value proposition end-to-end as fast as possible, then fills in real inbound sync, then closes UI-parity gaps, then adds genuine enhancements.

Backend is built entirely on **Next.js Route Handlers** (`app/api/**/route.ts`) — no separate server.

### Cross-cutting constraints (apply to every module below)

- **Auth & storage: Supabase.** Supabase Auth for user accounts/sessions, Supabase Postgres for all application data. No separate auth library, no separate database host.
- **Providers, for now: Google (Gmail) and Microsoft (Outlook) only.** iCloud/generic IMAP and Hotmail-specific work are natural future extensions of the same patterns (Hotmail is already a Microsoft Graph account under the hood) but are explicitly out of scope until later.
- **No paid services or paid tiers, anywhere.** Every module uses free/open-source tooling or a generous free tier. This is why the plan uses a Postgres-native job queue instead of Redis, Supabase Storage instead of S3/Vercel Blob, and polling instead of a paid push-broker (e.g. GCP Pub/Sub) as the *required* baseline.
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
- `mailboxes(id, user_id FK, email, provider ENUM('gmail','outlook'), is_default, send_pin_hash NULL, lock_pin_hash NULL, created_at)` — schema only; PIN set/verify flows land in Module 10.

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
- `src/components/compose/SendPinModal.tsx` — the plaintext `pin !== account.sendPin` check moves server-side (`bcrypt.compare` against `mailboxes.send_pin_hash`, returns 403 on mismatch — PIN *setting* UI itself lands in Module 10).
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

## Module 5 — Provider Adapter Abstraction + Postgres-Native Job Queue

**Description:** A refactor + infrastructure module, sequenced right before inbound sync because sync needs both pieces. First, generalizes the two send paths that now exist ad hoc (Gmail from Module 2, Graph from Module 4) behind one `ProviderAdapter` interface (`sendMail`, `fetchMessages`, `fetchMessageBody`, `applyFlags`, `moveToFolder`), so later modules call one abstraction regardless of provider. Second, stands up the background job runner sync requires, since backfilling a mailbox's history cannot happen inside one Route Handler's request/response cycle.

**Tech:** `pg-boss` — a Postgres-backed job queue with retries/scheduling, running against the same Supabase Postgres instance. Chosen specifically to avoid a paid/hosted Redis add-on (e.g. BullMQ+Redis).

**Wires up:** no direct UI wiring — pure backend/architecture module that unblocks Module 6.

**Data model additions:**
- `sync_state(mailbox_id FK UNIQUE, provider, last_history_id NULL, last_delta_link NULL, last_synced_at, backfill_complete BOOLEAN)` — provider-specific cursor storage (Gmail `historyId`, Graph `deltaLink`) unified into one row shape.
- `pg-boss` creates and manages its own job/schedule tables automatically.

**Key API routes:** none new (internal workers).

---

## Module 6 — Inbound Sync Engine (Backfill + Polling Incremental)

**Description:** The largest single module. For each connected mailbox: (1) an initial backfill job pages through message history and normalizes every message into the `emails`/`email_recipients` schema via the Module 5 adapter; (2) an incremental sync keeps it current via **polling** — Gmail `history.list` and Graph delta queries, run on a `pg-boss` schedule every few minutes. Polling (not a paid push-broker like GCP Pub/Sub) is the required baseline; real push is an explicit enhancement in Module 15. Inbound HTML bodies are sanitized server-side before storage/render to prevent stored-XSS from arbitrary sender HTML.

**Tech:** `googleapis` (`history.list`), `@azure/msal-node` + Graph delta queries, `sanitize-html` for inbound HTML sanitization, `pg-boss` (Module 5) for backfill/poll jobs.

**Wires up:**
- `src/components/shell/FolderNav.tsx`/`FolderNavItem.tsx` — unread counts (`getFolderCounts`) now reflect real inbound mail.
- `src/components/mail-list/EmailList.tsx`, `EmailListRow.tsx` — list genuinely grows as new mail arrives (via client refetch/poll — true live push is Module 15).
- `src/components/reading-pane/EmailDetail.tsx` — **required frontend change**: currently renders `email.bodyParagraphs.map(p => <p>{p}</p>)` (plain-text paragraph model). Real inbound mail is HTML, so this component must switch to rendering sanitized `body_html` (e.g. `dangerouslySetInnerHTML` on the pre-sanitized string).
- `src/types/index.ts` `Email` type needs `bodyHtml`/`bodyText` in place of (or alongside, for composer parity) `bodyParagraphs`.

**Data model additions:**
- `emails` gains `provider_message_id` (unique per mailbox, for idempotent upsert during sync) and `thread_id` (nullable; forward-compatible column for future threading — no threading UI exists today, none is built here).
- `sync_state` (added in Module 5) is populated/updated here.

**Key API routes:**
- `POST /api/internal/sync/[mailboxId]/backfill` — enqueues the initial backfill (triggered right after Module 2/4's connect flow completes).
- `GET /api/mail` (from Module 3) now returns real synced data instead of only sent mail.

---

## Module 7 — Two-Way Mailbox Actions Sync

**Description:** Today `EmailToolbar.tsx`'s star/archive/trash and read-state changes only mutate the local DB (after Module 3). This module writes those actions back to the real Gmail/Outlook mailbox so the app stays consistent with what the user sees when they check mail elsewhere — required for a mail client to feel trustworthy.

**Tech:** provider-specific write operations behind the Module 5 adapter — Gmail: `users.messages.modify` (label add/remove: `STARRED`, `UNREAD`; archive = remove `INBOX` label; trash = `users.messages.trash`); Graph: `PATCH /me/messages/{id}` for `isRead`/`flag`, `POST /me/messages/{id}/move` for archive/delete.

**Wires up:**
- `src/components/reading-pane/EmailToolbar.tsx` — star/archive/trash buttons' `PATCH /api/mail/[id]` calls (Module 3) now propagate to the provider, not just the local DB.
- `src/components/mail-list/EmailListRow.tsx` — star toggle, same propagation.

**Data model additions:** none new; `emails.provider_message_id` (Module 6) makes the write-back addressable.

**Key API routes:** `PATCH /api/mail/[id]` (extended) — performs the local write and enqueues (via `pg-boss`) a provider write-back job, so the UI updates optimistically without blocking on the round-trip to Gmail/Graph.

---

## Module 8 — Server-Side Cross-Account Search

**Description:** Replaces `getVisibleEmails`'s client-side substring match (`src/lib/utils.ts`, scoped to the single active account+folder) with real server-side search across **all** of the user's connected mailboxes at once — closing the explicitly-noted gap that today's search never searches cross-account.

**Tech:** Postgres full-text search (`tsvector` generated column over subject/preview/body) plus `pg_trgm` for fuzzy/substring matching on sender name/email — both native to Supabase Postgres, no extra service.

**Wires up:**
- `src/components/mail-list/SearchBar.tsx` — `dispatch({ type: "SET_SEARCH" })` gains a debounced `GET /api/mail/search?q=` call; when a query is active, results are no longer scoped by `activeAccountId`/`activeFolderId`.
- `src/components/mail-list/EmailListRow.tsx`/`MailListPane.tsx` — cross-account result rows need an account/folder indicator that doesn't exist today (flagged new UI affordance).

**Data model additions:** `emails` gains a generated `search_vector tsvector` column + GIN index; `pg_trgm` extension enabled.

**Key API routes:** `GET /api/mail/search?q=&scope=all|account`.

---

## Module 9 — Drafts Autosave

**Description:** The `drafts` folder exists as an enum value and mock seed (`e7` in `INITIAL_EMAILS`) but nothing auto-saves drafts today. This module periodically persists in-progress compose state and lets a draft be reopened for editing.

**Tech:** debounced client-side autosave hook (plain `useEffect` + `setTimeout`, no new library needed).

**Wires up:**
- `src/components/compose/ComposeDrawer.tsx`, `ComposeFields.tsx`, `ComposeBody.tsx` — draft fields debounce-save via `PATCH /api/mail/drafts/[id]` (or `POST` on first keystroke to obtain an id).
- `src/components/mail-list/EmailListRow.tsx`/`MailListPane.tsx` — **new behavior**: clicking a row in the `drafts` folder must reopen `ComposeDrawer` prefilled instead of the current every-row-does-`SELECT_EMAIL`-into-`ReadingPane` behavior.

**Data model additions:** none beyond `emails` with `folder = 'drafts'` (reuses Module 3's schema).

**Key API routes:** `POST /api/mail/drafts`, `PATCH /api/mail/drafts/[id]`, `DELETE /api/mail/drafts/[id]`.

---

## Module 10 — Mailbox Security: Send PIN & Lock PIN Persistence

**Description:** Makes the per-mailbox Send PIN and Lock PIN features (unique to this app) real and hashed, replacing the plaintext `sendPin`/`lockPin` strings in the mock. Also fixes a real design gap in the current mock: `Mailbox.locked` is a persistent boolean, meaning once unlocked it would stay unlocked forever. This module deliberately makes "unlocked" **session-scoped** (a JWT claim or a `session_unlocks` table), not a DB column, so a mailbox re-locks on every new login — matching what the mock's locked-Hotmail-by-default entry implies.

**Tech:** `bcrypt` (or Postgres `pgcrypto`) for `send_pin_hash`/`lock_pin_hash`.

**Wires up:**
- `src/components/settings/MailboxCard.tsx`, `PinEditPanel.tsx`, `SecurityToggleRow.tsx` — `dispatch({ type: "SET_ACCOUNT_SEND_PIN" / "SET_ACCOUNT_LOCK_PIN" })` replaced with `PATCH /api/mailboxes/[id]/send-pin` / `.../lock-pin`.
- `src/components/shell/LockedMailboxScreen.tsx` — the client-side `pin === account.lockPin` compare replaced with `POST /api/mailboxes/[id]/unlock`, which sets the session-scoped unlock and returns success/failure.
- `src/components/compose/SendPinModal.tsx` — already posts `pin` to `POST /api/mail/send` (Module 3); no change needed, just confirms the hash it's checked against is now settable.

**Data model additions:** `session_unlocks(session_id, mailbox_id, unlocked_at)` (or a session claim `unlockedMailboxIds: string[]`).

**Key API routes:** `PATCH /api/mailboxes/[id]/send-pin`, `PATCH /api/mailboxes/[id]/lock-pin`, `POST /api/mailboxes/[id]/unlock`.

---

## Module 11 — Settings & Account Persistence

**Description:** Makes the Account and Security settings tabs actually persist, closing two explicitly-noted gaps: `AccountTab.tsx`'s name/email edit is local-only, and `SecurityTab.tsx`'s password change doesn't touch anything real.

**Tech:** `supabase.auth.updateUser` for password change (with current-password re-verification); `profiles` table for name.

**Wires up:**
- `src/components/settings/AccountTab.tsx` — `dispatch({ type: "UPDATE_USER", patch: { name, loginEmail: email } })` replaced with `PATCH /api/user`.
- `src/components/settings/SecurityTab.tsx` — the fake `setStatus({ message: "Password updated." })` (which never checks `current` against anything real) replaced with a real Supabase password-update call that genuinely verifies `current` and surfaces real errors.

**Data model additions:** none beyond `profiles` (Module 1).

**Key API routes:** `PATCH /api/user`, `PATCH /api/user/password`.

---

## Module 12 — Attachments

**Description:** Adds attachment support end to end: outbound compose attachments, inbound attachment display/download. Currently there is no attachment field anywhere in `Email`/`EmailCta` and no UI for it, so this is new surface area, not a wiring fix. Required for a "fully working" email client, but nothing else in the app depends on it, so it trails the core send/sync/tracking loop and the UI-parity fixes above.

**Tech:** **Supabase Storage** (included in the Supabase free tier — no S3/Vercel Blob) for upload/download; multipart upload handled via `request.formData()` in a Route Handler.

**Wires up:**
- `src/components/compose/ComposeFields.tsx`/a new `ComposeAttachments.tsx` — new file upload UI (doesn't exist today).
- `src/components/reading-pane/EmailDetail.tsx` — new attachment-chip list rendering.
- Module 3's `POST /api/mail/send` — extended to attach files via Gmail raw MIME parts / Graph `attachments` array.
- Module 6's sync engine — extended to pull attachment parts during backfill/incremental sync (Gmail `payload.parts`, Graph `/attachments`).

**Data model additions:** `attachments(id, email_id FK, filename, mime_type, size_bytes, storage_key, created_at)`.

**Key API routes:** `POST /api/mail/attachments` (uploads to Supabase Storage), `GET /api/attachments/[id]` (auth-checked download/signed URL).

---

## Module 13 — Contacts / Address Book *(stretch)*

**Description:** Today `parseAddressList` (`src/lib/utils.ts`) naively derives a display name from the local-part of whatever's typed — there's no address book, no autocomplete, no contact history. This module adds one, derived automatically from synced/sent mail plus manual entry. The product is fully functional without it; this is a convenience layer over an already-working naive parser.

**Tech:** no new external dependency — Postgres table + a client-side combobox built with existing UI primitives.

**Wires up:**
- `src/components/compose/ComposeFields.tsx` — To/Cc/Bcc inputs gain an autocomplete dropdown (new component), replacing the current bare `<input>` fields.

**Data model additions:** `contacts(id, user_id FK, name, email, last_used_at, use_count)`.

**Key API routes:** `GET /api/contacts?q=`, `POST /api/contacts`. A background job (Module 5's `pg-boss`) upserts contacts from `email_recipients`/sent mail after each sync/send.

---

## Module 14 — Notifications *(stretch)*

**Description:** No notification system exists today. Adds in-app and browser-level notification of new mail. The polling baseline (unread counts already computed in Module 6) is sufficient for correctness; this module is a pure UX enhancement.

**Tech:** baseline: polling `GET /api/mail/unread-count`; enhancement: Web Push (`web-push` npm package, VAPID keys — free, no paid push service) for OS-level notifications when the tab isn't focused.

**Wires up:** `src/components/shell/Sidebar.tsx`/`FolderNav.tsx` badges (already show unread counts, but from local state — this makes them live), plus a new toast/notification affordance (no current component covers this).

**Data model additions:** `push_subscriptions(id, user_id FK, endpoint, keys_json)` if Web Push is implemented.

**Key API routes:** `GET /api/mail/unread-count`, `POST /api/push/subscribe`.

---

## Module 15 — Real-Time Push Enhancements *(stretch)*

**Description:** An explicit enhancement layer over the polling-based baseline shipped in Modules 6/14 — the product is already complete and correct without it. Two upgrades:
1. **Client delivery:** replaces client polling with **Supabase Realtime** (Postgres change-feed over websockets, built into the platform's free tier — no separate SSE/WebSocket infra to build or pay for) so newly synced mail and tracking events (opens/clicks) appear in the UI within seconds.
2. **Sync freshness:** upgrades Module 6's polling to real push — Gmail `watch()` (requires a Cloud Pub/Sub topic, free-tier eligible) and Microsoft Graph change-notification subscriptions (native webhooks, no broker needed, but expire ~3 days and must be renewed via a recurring `pg-boss` job).

**Tech:** Supabase Realtime (`@supabase/supabase-js` realtime client); `googleapis` `watch()` + Pub/Sub push endpoint; Graph subscriptions webhook.

**Wires up:** `src/components/reading-pane/TrackingStatus.tsx` (live-updating open/click dot instead of poll-refreshed), `FolderNav.tsx` (live unread counts), `EmailList.tsx` (new mail appears without refresh).

**Data model additions:** none new.

**Key API routes:** `POST /api/webhooks/gmail`, `POST /api/webhooks/microsoft`.

---

# Ordering Rationale

The order above optimizes for **fastest path to a working product with the core differentiator (read-receipt tracking) proven early**, not pure dependency order:

1. **Module 1 (Supabase auth + DB) must be first** — nothing else can persist or be scoped to a real user without it.
2. **Module 2 (Gmail connect + send)** — the fastest way to get one real, working mailbox, scoped to a single provider to keep it fast.
3. **Module 3 (tracking pixel/click engine) comes before a second provider** — this is the single highest-value module in the product, and it's provider-agnostic once one mailbox exists. Shipping it third proves the core value prop end-to-end before investing in provider breadth or the largest remaining effort (inbound sync).
4. **Module 4 (Outlook/Graph connect + send)** — extends the proven send+tracking path to the second provider in scope.
5. **Module 5 (adapter abstraction + Postgres job queue)** is placed right before sync because by this point two ad hoc send paths exist and need consolidating, and because inbound sync is impossible to do correctly in a request/response cycle — the queue is a hard prerequisite for Module 6, not a nice-to-have.
6. **Module 6 (inbound sync engine)** is the single largest module, which is exactly why it's sequenced after the send/tracking loop already works — it can take the longest without blocking demonstrable value. Polling (not a paid push broker) is the required baseline.
7. **Module 7 (two-way action sync)** follows sync because messages need to exist locally (Module 6) before their star/archive/trash state can be meaningfully written back.
8. **Modules 8–11 (search, drafts, PIN persistence, settings persistence)** are UI-parity fixes for gaps explicitly present in the current codebase (no cross-account search, no draft autosave, plaintext PINs, dead password-change form). None of them block another module, so they're grouped together.
9. **Module 12 (attachments)** is real, required product functionality but nothing else depends on it, so it's placed after the UI-parity fixes despite being more work than any single module in the 8–11 group.
10. **Modules 13–15 (contacts, notifications, real-time push)** are last because the product is fully functional without them — genuine enhancements over an already-complete, polling-based, address-book-free baseline.

---

# Required vs. Stretch

**Required for "fully working product":** Modules 1–12 — auth, real mailbox connect for both provider families in scope, real send, the tracking-pixel/click differentiator, inbound sync, two-way action sync, search, drafts, PIN security, settings persistence, attachments.

**Stretch / nice-to-have — product is complete without them:**
- **Module 13 (Contacts/address book)** — today's `parseAddressList` naive local-part derivation is functional, if unpolished; an address book is a convenience layer.
- **Module 14 (Notifications)** — polling-refreshed unread counts (already part of Module 6/8's baseline) are sufficient for correctness; push notifications are a UX enhancement.
- **Module 15 (Real-time push)** — SSE/websocket delivery and webhook-driven Gmail/Graph push over the polling fallback are upgrades over an already-correct baseline, not requirements.
- Within Module 8 (search), the cross-account result disambiguation UI (showing which mailbox/folder a result belongs to) is flagged inline as net-new UI, not just a backend wiring change — small effort, but worth calling out.
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
