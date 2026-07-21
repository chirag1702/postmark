"use client";

import clsx from "clsx";
import { Avatar } from "@/components/ui/Avatar";
import { useAppState, type SettingsTab } from "@/context/app-state-context";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "mailboxes", label: "Linked mailboxes" },
];

export function SettingsNav() {
  const { mail, ui, setUi } = useAppState();

  return (
    <div className="flex w-[220px] shrink-0 flex-col gap-1 border-r border-hairline-row bg-surface-input px-3 py-5">
      <div className="flex items-center gap-2.5 px-2 pb-4">
        <Avatar name={mail.user.name} tone="dark" size={30} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink-primary">
            {mail.user.name}
          </p>
          <p className="truncate font-mono text-[9.5px] uppercase tracking-mono-label-wide text-ink-faint">
            Master account
          </p>
        </div>
      </div>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setUi({ settingsActiveTab: tab.id })}
          className={clsx(
            "rounded-9 px-3 py-2 text-left text-[13.5px] transition-colors",
            ui.settingsActiveTab === tab.id
              ? "bg-surface-nav-active font-semibold text-ink-primary"
              : "font-medium text-ink-nav-inactive hover:bg-surface-account-hover"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
