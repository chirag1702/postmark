"use client";

import clsx from "clsx";
import { Dot } from "@/components/ui/Dot";
import { Badge } from "@/components/ui/Badge";

interface FolderNavItemProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

export function FolderNavItem({ label, count, active, onClick }: FolderNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-9 px-3 py-2 text-left text-[13.5px] transition-colors",
        active
          ? "bg-surface-nav-active font-semibold text-ink-primary"
          : "font-medium text-ink-nav-inactive hover:bg-surface-account-hover"
      )}
    >
      <Dot
        size={6}
        filled={active}
        color={active ? "var(--color-ink-primary)" : "var(--color-ink-faint)"}
      />
      <span className="flex-1 truncate">{label}</span>
      {count > 0 && <Badge active={active}>{count}</Badge>}
    </button>
  );
}
