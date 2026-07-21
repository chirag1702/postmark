"use client";

import { Mail } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppState } from "@/context/app-state-context";
import { useMailSearch } from "@/hooks/useMailSearch";
import { FOLDERS } from "@/lib/mock-data";
import { getVisibleEmails } from "@/lib/utils";
import { EmailListRow } from "./EmailListRow";

export function EmailList() {
  const { mail, dispatch } = useAppState();
  const isSearching = mail.searchQuery.trim().length > 0;
  const { results: searchResults, loading: searchLoading } = useMailSearch(mail.searchQuery);

  const emails = isSearching
    ? searchResults
    : getVisibleEmails(
        mail.emails,
        mail.activeAccountId,
        mail.activeFolderId,
        mail.searchQuery
      );

  if (emails.length === 0) {
    const title = isSearching
      ? searchLoading
        ? "Searching…"
        : "No results found."
      : "Nothing here.";
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
      {emails.map((email) => {
        const sourceBadge = isSearching
          ? {
              mailboxLabel:
                mail.accounts.find((a) => a.id === email.accountId)?.email ?? "",
              folderLabel: FOLDERS.find((f) => f.id === email.folderId)?.label ?? "",
            }
          : undefined;
        return (
          <EmailListRow
            key={email.id}
            email={email}
            selected={email.id === mail.selectedEmailId}
            sourceBadge={sourceBadge}
            onClick={() => {
              if (isSearching) dispatch({ type: "UPDATE_EMAIL", email });
              dispatch({ type: "SELECT_EMAIL", emailId: email.id });
            }}
          />
        );
      })}
    </div>
  );
}
