"use client";

import clsx from "clsx";
import { Star } from "lucide-react";
import { Dot } from "@/components/ui/Dot";
import { useAppState } from "@/context/app-state-context";
import { trackingSummary } from "@/lib/utils";
import type { Email } from "@/types";
import { PreviewSnippet } from "./PreviewSnippet";

interface EmailListRowProps {
  email: Email;
  selected: boolean;
  onClick: () => void;
}

export function EmailListRow({ email, selected, onClick }: EmailListRowProps) {
  const { ui } = useAppState();
  const isSent = email.folderId === "sent";
  const counterpart = isSent
    ? (email.to[0]?.name ?? email.to[0]?.email ?? "")
    : email.from.name;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full flex-col gap-1 border-b border-hairline-row px-5 text-left transition-colors",
        ui.density === "compact" ? "py-2" : "py-3",
        selected ? "bg-surface-row-selected" : "hover:bg-surface-row-hover"
      )}
    >
      <div className="flex items-center gap-2">
        <Dot
          size={7}
          filled={email.unread}
          color={
            email.unread ? "var(--color-ink-primary)" : "transparent"
          }
        />
        <span
          className={clsx(
            "flex-1 truncate text-[13.5px]",
            email.unread
              ? "font-semibold text-ink-primary"
              : "font-medium text-ink-body"
          )}
        >
          {isSent ? `To: ${counterpart}` : counterpart}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">
          {email.timestamp}
        </span>
      </div>
      <p
        className={clsx(
          "truncate pl-[15px] text-[13px]",
          email.unread ? "font-medium text-ink-body" : "text-ink-muted"
        )}
      >
        {email.subject}
      </p>
      <div className="pl-[15px]">
        {email.tracking ? (
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-faint">
            <Dot
              size={6}
              filled={email.tracking.opens.length > 0}
              pulse={email.tracking.opens.length > 0}
              color="var(--color-ink-primary)"
            />
            {trackingSummary(email.tracking)}
          </span>
        ) : email.starred ? (
          <Star size={12} className="fill-gold-star text-gold-star" />
        ) : ui.showPreview ? (
          <PreviewSnippet text={email.previewText} />
        ) : null}
      </div>
    </button>
  );
}
