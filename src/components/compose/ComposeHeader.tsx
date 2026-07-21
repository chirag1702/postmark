"use client";

import { X } from "lucide-react";
import { EMPTY_COMPOSE_DRAFT, useAppState } from "@/context/app-state-context";

export function ComposeHeader() {
  const { setUi } = useAppState();

  return (
    <div className="flex items-center justify-between rounded-t-[16px] bg-ink-primary px-5 py-3">
      <span className="text-[13px] font-semibold text-ink-on-dark">
        New message
      </span>
      <button
        type="button"
        onClick={() =>
          setUi({ composeOpen: false, composeDraft: EMPTY_COMPOSE_DRAFT })
        }
        className="flex h-6 w-6 items-center justify-center rounded-full text-ink-on-dark/70 transition-colors hover:bg-white/10 hover:text-ink-on-dark"
      >
        <X size={14} />
      </button>
    </div>
  );
}
