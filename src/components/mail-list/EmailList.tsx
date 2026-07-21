"use client";

import { Loader2, Mail } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppState } from "@/context/app-state-context";
import { getVisibleEmails } from "@/lib/utils";
import { EmailListRow } from "./EmailListRow";

export function EmailList() {
  const { mail, dispatch } = useAppState();
  const isSearching = mail.searchQuery.trim().length > 0;
  const isLoadingAccountMail = !mail.emailsLoaded[mail.activeAccountId];

  const emails = getVisibleEmails(
    mail.emails,
    mail.activeAccountId,
    mail.activeFolderId,
    mail.searchQuery
  );

  if (isLoadingAccountMail) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<Loader2 size={20} strokeWidth={1.5} className="animate-spin" />}
          title="Loading mail…"
        />
      </div>
    );
  }

  if (emails.length === 0) {
    const title = isSearching ? "No results found." : "Nothing here.";
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<Mail size={20} strokeWidth={1.5} />}
          title={title}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {emails.map((email) => (
        <EmailListRow
          key={email.id}
          email={email}
          selected={email.id === mail.selectedEmailId}
          onClick={() => dispatch({ type: "SELECT_EMAIL", emailId: email.id })}
        />
      ))}
    </div>
  );
}
