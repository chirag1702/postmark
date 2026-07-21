"use client";

import clsx from "clsx";
import { Archive, Reply, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAppState } from "@/context/app-state-context";
import type { Email, FolderId } from "@/types";

interface EmailToolbarProps {
  email: Email;
}

/** Returns the full updated `Email` for sent-mail (Postgres-backed) rows; for live (provider)
 * mail there's no local row to echo back, so the route just confirms `{ ok: true }` and the
 * caller relies on its own optimistic update instead. */
async function patchEmail(id: string, patch: Record<string, unknown>): Promise<Email | null> {
  const res = await fetch(`/api/mail/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return "id" in data ? (data as Email) : null;
}

export function EmailToolbar({ email }: EmailToolbarProps) {
  const { dispatch, setUi } = useAppState();

  const handleReply = () => {
    setUi({
      composeOpen: true,
      composeDraft: {
        to: email.from.email,
        cc: "",
        bcc: "",
        subject: email.subject.startsWith("Re:")
          ? email.subject
          : `Re: ${email.subject}`,
        body: "",
        showCcBcc: false,
      },
    });
  };

  const handleToggleStar = async () => {
    const optimistic = { ...email, starred: !email.starred };
    dispatch({ type: "UPDATE_EMAIL", email: optimistic });
    const updated = await patchEmail(email.id, { starred: optimistic.starred });
    if (updated) dispatch({ type: "UPDATE_EMAIL", email: updated });
  };

  const handleMoveToFolder = async (folderId: FolderId) => {
    // EmailToolbar is only ever rendered for the currently selected email -- moving it out
    // of the active folder should close the reading pane, matching the prior local-only behavior.
    dispatch({ type: "UPDATE_EMAIL", email: { ...email, folderId } });
    dispatch({ type: "SELECT_EMAIL", emailId: null });
    const updated = await patchEmail(email.id, { folder: folderId });
    if (updated) dispatch({ type: "UPDATE_EMAIL", email: updated });
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={handleToggleStar}
        className="flex h-8 w-8 items-center justify-center rounded-9 border border-hairline bg-surface-card text-ink-faint transition-colors hover:bg-surface-row-selected"
      >
        <Star
          size={15}
          className={clsx(email.starred && "fill-gold-star text-gold-star")}
        />
      </button>
      <button
        type="button"
        onClick={() => handleMoveToFolder("archive")}
        className="flex h-8 w-8 items-center justify-center rounded-9 border border-hairline bg-surface-card text-ink-button-secondary transition-colors hover:bg-surface-row-selected"
      >
        <Archive size={15} />
      </button>
      <button
        type="button"
        onClick={() => handleMoveToFolder("trash")}
        className="flex h-8 w-8 items-center justify-center rounded-9 border border-hairline bg-surface-card text-danger-text transition-colors hover:border-danger-border hover:bg-danger-bg"
      >
        <Trash2 size={15} />
      </button>
      <Button size="sm" onClick={handleReply}>
        <Reply size={14} />
        Reply
      </Button>
    </div>
  );
}
