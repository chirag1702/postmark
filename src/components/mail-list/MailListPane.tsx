"use client";

import { FOLDERS } from "@/lib/mock-data";
import { useAppState } from "@/context/app-state-context";
import { useMailSync } from "@/hooks/useMailSync";
import { SearchBar } from "./SearchBar";
import { EmailList } from "./EmailList";

export function MailListPane() {
  const { mail } = useAppState();
  useMailSync();
  const isSearching = mail.searchQuery.trim().length > 0;
  const folder = FOLDERS.find((f) => f.id === mail.activeFolderId);

  return (
    <section className="flex w-[394px] shrink-0 flex-col border-r border-hairline-row">
      <div className="flex flex-col gap-3 border-b border-hairline-row px-5 pb-4 pt-5">
        <h2 className="text-[18px] font-semibold tracking-heading text-ink-primary">
          {isSearching ? "Search results" : folder?.label}
        </h2>
        <SearchBar />
      </div>
      <div className="flex-1 overflow-y-auto">
        <EmailList />
      </div>
    </section>
  );
}
