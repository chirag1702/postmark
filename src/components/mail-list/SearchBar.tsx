"use client";

import { Search } from "lucide-react";
import { useAppState } from "@/context/app-state-context";

export function SearchBar() {
  const { mail, dispatch } = useAppState();

  return (
    <div className="flex items-center gap-2 rounded-10 bg-surface-search px-3 py-2">
      <Search size={14} className="shrink-0 text-ink-faint" />
      <input
        type="text"
        placeholder="Search mail"
        value={mail.searchQuery}
        onChange={(e) => dispatch({ type: "SET_SEARCH", query: e.target.value })}
        className="w-full bg-transparent text-[13px] text-ink-body outline-none placeholder:text-ink-faint"
      />
    </div>
  );
}
