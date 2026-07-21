import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeInboundHtml } from "./sanitize-html";
import type {
  ProviderAdapter,
  FetchMessagesResult,
  FetchMessageBodyResult,
} from "@/lib/providers/types";

function derivePreview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

interface EmailInsertRow {
  id: string;
}

const FETCH_CONCURRENCY = 5;
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries a single message's body fetch a few times with linear backoff -- Gmail/Graph both
 * return transient rate-limit/5xx errors under enough concurrent load, and a bounded 10-day
 * backfill would rather wait a beat than drop the message. It's a pure read, so blind retrying
 * (rather than duck-typing each provider's distinct rate-limit error shape) is safe. */
async function fetchMessageBodyWithRetry(
  admin: SupabaseClient,
  adapter: ProviderAdapter,
  mailboxId: string,
  providerMessageId: string
): Promise<FetchMessageBodyResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      return await adapter.fetchMessageBody(admin, { mailboxId, providerMessageId });
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_FETCH_ATTEMPTS) {
        await delay(RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }
  throw lastErr;
}

/** Runs `fn` over `items` with at most `limit` in flight at once. A backfill page can be up to
 * 50 messages (Gmail); firing that many fully concurrent Gmail/Graph API calls at once reliably
 * triggers provider rate-limiting well before they all complete -- this is what caused most of a
 * page to fail to sync in practice, not an isolated/rare error. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Fetches the body for, and upserts, each message in a `fetchMessages` page. Insert-only
 * (`ON CONFLICT DO NOTHING`): provider message content is immutable once received, and
 * unread/starred become app-owned once synced -- a re-sync of an already-known message must
 * never overwrite local read/star state. Skips the "sent" folder entirely: the send path
 * already persists those messages (with tracking) at send time, so syncing them again would
 * create untracked duplicates.
 *
 * Throws if any message in the page fails to persist, so the caller's retry (a manual resync,
 * or the OAuth callback's own retry-free best-effort attempt) starts over cleanly -- safe because
 * the upsert is idempotent, so a retry just re-skips whatever already succeeded.
 */
export async function processMessagePage(
  admin: SupabaseClient,
  mailboxId: string,
  items: FetchMessagesResult["messages"],
  adapter: ProviderAdapter
): Promise<void> {
  const failures: unknown[] = [];

  await mapWithConcurrency(items, FETCH_CONCURRENCY, async (item) => {
    try {
      const body = await fetchMessageBodyWithRetry(
        admin,
        adapter,
        mailboxId,
        item.providerMessageId
      );

      const folder = item.folder ?? body.folder;
      if (!folder || folder === "sent") return;

      const bodyHtml = sanitizeInboundHtml(body.bodyHtml);

      const { data: inserted, error } = await admin
        .from("emails")
        .upsert(
          {
            mailbox_id: mailboxId,
            provider_message_id: item.providerMessageId,
            thread_id: item.threadId ?? null,
            folder,
            subject: body.subject,
            from_name: body.from.name,
            from_email: body.from.email,
            body_html: bodyHtml,
            body_text: body.bodyText,
            preview_text: derivePreview(body.bodyText),
            sent_at: body.sentAt,
            unread: body.unread,
            starred: body.starred,
          },
          { onConflict: "mailbox_id,provider_message_id", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle<EmailInsertRow>();

      if (error) {
        throw new Error(`upsert failed for ${item.providerMessageId}: ${error.message}`);
      }
      if (!inserted) return; // already synced -- recipients were written on first insert

      const recipients = [
        ...body.to.map((r) => ({ ...r, kind: "to" as const })),
        ...(body.cc ?? []).map((r) => ({ ...r, kind: "cc" as const })),
      ].filter((r) => r.email);

      if (recipients.length > 0) {
        const { error: recipientsError } = await admin.from("email_recipients").insert(
          recipients.map((r) => ({
            email_id: inserted.id,
            kind: r.kind,
            name: r.name,
            email: r.email,
          }))
        );
        if (recipientsError) {
          throw new Error(
            `recipient insert failed for ${item.providerMessageId}: ${recipientsError.message}`
          );
        }
      }
    } catch (err) {
      console.error(`processMessagePage: failed to sync ${item.providerMessageId}`, err);
      failures.push(err);
    }
  });

  if (failures.length > 0) {
    throw new Error(
      `processMessagePage: ${failures.length}/${items.length} message(s) failed to sync (mailbox ${mailboxId})`
    );
  }
}
