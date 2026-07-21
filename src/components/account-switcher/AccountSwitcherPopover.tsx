"use client";

import { Plus, Power, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/context/app-state-context";
import { getFolderCounts } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AccountSwitcherRow } from "./AccountSwitcherRow";

export function AccountSwitcherPopover() {
  const router = useRouter();
  const { mail, dispatch, setUi } = useAppState();

  const close = () => setUi({ accountSwitcherOpen: false });

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={close} />
      <div className="absolute bottom-full left-0 z-50 mb-2 w-full min-w-[236px] rounded-12 border border-hairline bg-surface-card p-2 shadow-account-dropdown animate-compose-in">
        {mail.accounts.length > 0 && (
          <>
            <p className="px-2.5 pb-1.5 pt-1 font-mono text-[9.5px] font-medium uppercase tracking-mono-label-wide text-ink-faint">
              Mailboxes
            </p>
            <div className="flex flex-col gap-0.5">
              {mail.accounts.map((account) => {
                const counts = getFolderCounts(mail.emails, account.id);
                return (
                  <AccountSwitcherRow
                    key={account.id}
                    account={account}
                    unreadCount={counts.inbox}
                    active={account.id === mail.activeAccountId}
                    onClick={() => {
                      dispatch({ type: "SET_ACTIVE_ACCOUNT", accountId: account.id });
                      close();
                    }}
                  />
                );
              })}
            </div>
            <div className="my-1.5 border-t border-hairline-row" />
          </>
        )}
        <button
          type="button"
          onClick={() =>
            setUi({
              settingsOpen: true,
              settingsActiveTab: "mailboxes",
              accountSwitcherOpen: false,
            })
          }
          className="flex w-full items-center gap-2.5 rounded-9 px-2.5 py-2 text-left text-[13px] font-medium text-ink-body transition-colors hover:bg-surface-account-hover"
        >
          <Plus size={14} className="text-ink-faint" />
          Connect a mailbox
        </button>
        <button
          type="button"
          onClick={() =>
            setUi({
              settingsOpen: true,
              settingsActiveTab: "account",
              accountSwitcherOpen: false,
            })
          }
          className="flex w-full items-center gap-2.5 rounded-9 px-2.5 py-2 text-left text-[13px] font-medium text-ink-body transition-colors hover:bg-surface-account-hover"
        >
          <Settings size={14} className="text-ink-faint" />
          Settings
        </button>
        <button
          type="button"
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.push("/login");
            router.refresh();
          }}
          className="flex w-full items-center gap-2.5 rounded-9 px-2.5 py-2 text-left text-[13px] font-medium text-danger-text transition-colors hover:bg-danger-bg"
        >
          <Power size={14} />
          Sign out
        </button>
      </div>
    </>
  );
}
