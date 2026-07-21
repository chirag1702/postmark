"use client";

import { Loader2 } from "lucide-react";
import { useAppState } from "@/context/app-state-context";
import { getActiveAccount } from "@/lib/utils";

export function SettingUpMailboxScreen() {
  const { mail } = useAppState();
  const account = getActiveAccount(mail.accounts, mail.activeAccountId);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-12 border border-hairline text-ink-icon-empty">
        <Loader2 size={20} strokeWidth={1.5} className="animate-spin" />
      </div>
      <p className="text-[14px] font-medium text-ink-body">
        Setting up your mailbox
      </p>
      <p className="max-w-[260px] text-[13px] text-ink-meta">
        We&apos;re pulling in the last 10 days of mail for {account?.email}. This only takes a
        moment.
      </p>
    </div>
  );
}
