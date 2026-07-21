"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EMPTY_COMPOSE_DRAFT, useAppState } from "@/context/app-state-context";
import { getActiveAccount } from "@/lib/utils";
import type { Email } from "@/types";

export function ComposeFooter() {
  const { mail, ui, setUi, dispatch } = useAppState();
  const account = getActiveAccount(mail.accounts, mail.activeAccountId);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleDiscard = () => {
    setUi({ composeOpen: false, composeDraft: EMPTY_COMPOSE_DRAFT });
  };

  const handleSend = async () => {
    if (!account) return;
    if (account.sendPin) {
      setUi({ sendPinModalOpen: true });
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId: account.id,
          to: ui.composeDraft.to,
          cc: ui.composeDraft.cc,
          bcc: ui.composeDraft.bcc,
          subject: ui.composeDraft.subject,
          body: ui.composeDraft.body,
          trackingEnabled: ui.readReceiptDefault,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? "Failed to send email.");
        return;
      }
      const email: Email = await res.json();
      dispatch({ type: "ADD_EMAIL", email });
      setUi({ composeOpen: false, composeDraft: EMPTY_COMPOSE_DRAFT });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-hairline-row px-5 py-3.5">
      {error && <p className="text-[12px] text-danger-text">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!ui.composeDraft.to.trim() || sending}
          >
            {sending ? "Sending…" : "Send"}
          </Button>
          <Checkbox
            checked={ui.readReceiptDefault}
            onChange={(checked) => setUi({ readReceiptDefault: checked })}
            label="Read receipt"
          />
        </div>
        <button
          type="button"
          onClick={handleDiscard}
          className="text-[13px] font-medium text-ink-faint transition-colors hover:text-ink-primary"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
