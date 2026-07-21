"use client";

import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useAppState } from "@/context/app-state-context";
import { getActiveAccount } from "@/lib/utils";

interface AccountSwitcherTriggerProps {
  onClick: () => void;
}

export function AccountSwitcherTrigger({ onClick }: AccountSwitcherTriggerProps) {
  const { mail } = useAppState();
  const account = getActiveAccount(mail.accounts, mail.activeAccountId);
  const label = account?.email ?? (mail.user.name || mail.user.loginEmail);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-9 px-2 py-2 text-left transition-colors hover:bg-surface-account-hover"
    >
      <Avatar name={label} tone="dark" size={28} />
      <span className="flex-1 truncate text-[13px] font-medium text-ink-body">
        {label}
      </span>
      <ChevronDown size={14} className="shrink-0 text-ink-faint" />
    </button>
  );
}
