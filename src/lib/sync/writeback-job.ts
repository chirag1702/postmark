import type PgBoss from "pg-boss";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviderAdapter } from "@/lib/providers";
import { ProviderMethodNotImplementedError } from "@/lib/providers/types";
import type { SyncMailboxProvider } from "./sync-state";
import type { MailWritebackJobData } from "./queue-names";

/**
 * Propagates a local star/unread/folder change back to the real Gmail/Outlook mailbox.
 * `ProviderMethodNotImplementedError` (moving to a folder other than archive/trash -- not
 * reachable from the UI today) is swallowed rather than retried: no amount of retrying makes an
 * unimplemented method succeed.
 */
export async function handleMailWritebackJob(jobs: PgBoss.Job<MailWritebackJobData>[]): Promise<void> {
  const admin = createAdminClient();

  for (const job of jobs) {
    const { mailboxId, providerMessageId, patch } = job.data;

    const { data: mailbox } = await admin
      .from("mailboxes")
      .select("provider")
      .eq("id", mailboxId)
      .maybeSingle<{ provider: SyncMailboxProvider }>();

    if (!mailbox) continue; // mailbox was disconnected/deleted since this job was enqueued

    const adapter = getProviderAdapter(mailbox.provider);

    try {
      if (patch.starred !== undefined || patch.unread !== undefined) {
        await adapter.applyFlags(admin, {
          mailboxId,
          providerMessageId,
          flags: { starred: patch.starred, unread: patch.unread },
        });
      }
      if (patch.folder !== undefined) {
        await adapter.moveToFolder(admin, { mailboxId, providerMessageId, folder: patch.folder });
      }
    } catch (err) {
      if (err instanceof ProviderMethodNotImplementedError) {
        console.warn(`mail.writeback: skipping unsupported action -- ${err.message}`);
        continue;
      }
      throw err;
    }
  }
}
