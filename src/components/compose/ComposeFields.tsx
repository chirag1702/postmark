"use client";

import { ReactNode } from "react";
import { useAppState } from "@/context/app-state-context";
import { getActiveAccount } from "@/lib/utils";

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-hairline-row px-5 py-2.5">
      <span className="w-[44px] shrink-0 text-[12px] font-medium text-ink-label">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

export function ComposeFields() {
  const { mail, ui, setUi } = useAppState();
  const account = getActiveAccount(mail.accounts, mail.activeAccountId);

  const updateDraft = (patch: Partial<typeof ui.composeDraft>) =>
    setUi({ composeDraft: { ...ui.composeDraft, ...patch } });

  return (
    <div className="flex flex-col">
      <FieldRow label="From">
        <span className="text-[13px] text-ink-muted">{account?.email}</span>
      </FieldRow>
      <FieldRow label="To">
        <input
          type="text"
          value={ui.composeDraft.to}
          onChange={(e) => updateDraft({ to: e.target.value })}
          placeholder="recipient@example.com"
          className="w-full bg-transparent text-[13px] text-ink-body outline-none placeholder:text-ink-faint"
        />
        {!ui.composeDraft.showCcBcc && (
          <button
            type="button"
            onClick={() => updateDraft({ showCcBcc: true })}
            className="shrink-0 text-[12px] font-medium text-ink-faint transition-colors hover:text-ink-primary"
          >
            Cc/Bcc
          </button>
        )}
      </FieldRow>
      {ui.composeDraft.showCcBcc && (
        <>
          <FieldRow label="Cc">
            <input
              type="text"
              value={ui.composeDraft.cc}
              onChange={(e) => updateDraft({ cc: e.target.value })}
              className="w-full bg-transparent text-[13px] text-ink-body outline-none"
            />
          </FieldRow>
          <FieldRow label="Bcc">
            <input
              type="text"
              value={ui.composeDraft.bcc}
              onChange={(e) => updateDraft({ bcc: e.target.value })}
              className="w-full bg-transparent text-[13px] text-ink-body outline-none"
            />
          </FieldRow>
        </>
      )}
      <FieldRow label="Subject">
        <input
          type="text"
          value={ui.composeDraft.subject}
          onChange={(e) => updateDraft({ subject: e.target.value })}
          className="w-full bg-transparent text-[13px] text-ink-body outline-none"
        />
      </FieldRow>
    </div>
  );
}
