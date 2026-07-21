"use client";

import { ReactNode } from "react";
import { useAppState } from "@/context/app-state-context";
import { getActiveAccount } from "@/lib/utils";
import { EmptyMailboxScreen } from "./EmptyMailboxScreen";
import { LockedMailboxScreen } from "./LockedMailboxScreen";

interface MainPanelProps {
  children: ReactNode;
}

export function MainPanel({ children }: MainPanelProps) {
  const { mail } = useAppState();
  const account = getActiveAccount(mail.accounts, mail.activeAccountId);

  let content: ReactNode;
  if (mail.accounts.length === 0) {
    content = <EmptyMailboxScreen />;
  } else if (account?.locked) {
    content = <LockedMailboxScreen />;
  } else {
    content = children;
  }

  return (
    <main className="m-[10px] flex flex-1 overflow-hidden rounded-16 bg-surface-card shadow-panel">
      {content}
    </main>
  );
}
