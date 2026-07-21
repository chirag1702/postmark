"use client";

import { InlineStatus } from "@/components/ui/InlineStatus";
import { useAppState } from "@/context/app-state-context";
import { MailboxCard } from "./MailboxCard";
import { ProviderConnectGrid } from "./ProviderConnectGrid";

export function LinkedMailboxesTab() {
  const { mail, ui, setUi } = useAppState();

  return (
    <div className="flex flex-col gap-6 p-7">
      <div>
        <h3 className="text-[15px] font-semibold text-ink-primary">
          Linked mailboxes
        </h3>
        <p className="mt-1 text-[13px] text-ink-meta">
          Manage the mailboxes connected to your account.
        </p>
        <InlineStatus
          className="mt-2 block"
          message={ui.mailboxConnectStatus?.message ?? null}
          type={ui.mailboxConnectStatus?.type}
          onClear={() => setUi({ mailboxConnectStatus: null })}
        />
      </div>
      <div className="flex flex-col gap-3">
        {mail.accounts.map((account) => (
          <MailboxCard key={account.id} account={account} />
        ))}
      </div>
      <div>
        <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-mono-label-wide text-ink-faint">
          Link a new mailbox
        </p>
        <ProviderConnectGrid />
      </div>
    </div>
  );
}
