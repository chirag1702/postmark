"use client";

import { useAppState } from "@/context/app-state-context";

export function ComposeBody() {
  const { ui, setUi } = useAppState();

  return (
    <textarea
      value={ui.composeDraft.body}
      onChange={(e) =>
        setUi({ composeDraft: { ...ui.composeDraft, body: e.target.value } })
      }
      placeholder="Write your message…"
      className="min-h-[160px] w-full flex-1 resize-none bg-transparent px-5 py-4 text-[14px] leading-relaxed text-ink-body outline-none placeholder:text-ink-faint"
    />
  );
}
