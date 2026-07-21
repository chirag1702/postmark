"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Dot } from "@/components/ui/Dot";
import type { Mailbox } from "@/types";

interface AccountSwitcherRowProps {
  account: Mailbox;
  unreadCount: number;
  active: boolean;
  onClick: () => void;
}

export function AccountSwitcherRow({
  account,
  unreadCount,
  active,
  onClick,
}: AccountSwitcherRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-9 px-2.5 py-2 text-left transition-colors hover:bg-surface-account-hover"
    >
      <Avatar name={account.email} tone={active ? "dark" : "light"} size={26} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink-body">
          {account.email}
        </p>
        <p className="truncate font-mono text-[10px] uppercase tracking-mono-label text-ink-faint">
          {account.provider}
        </p>
      </div>
      {account.backfillComplete === false && (
        <span title="Setting up…">
          <Dot size={6} color="var(--color-ink-faint)" pulse />
        </span>
      )}
      {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
      {active && <Dot size={6} color="var(--color-ink-primary)" />}
    </button>
  );
}
