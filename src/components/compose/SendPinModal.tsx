"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PinInput } from "@/components/ui/PinInput";
import { EMPTY_COMPOSE_DRAFT, useAppState } from "@/context/app-state-context";
import { getActiveAccount } from "@/lib/utils";
import type { Email } from "@/types";

export function SendPinModal() {
  const { mail, ui, setUi, dispatch } = useAppState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const account = getActiveAccount(mail.accounts, mail.activeAccountId);

  const close = () => {
    setUi({ sendPinModalOpen: false });
    setPin("");
    setError(null);
  };

  const handleConfirm = async () => {
    if (!account) return;
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
          pin,
        }),
      });
      if (res.status === 403) {
        setError("Incorrect PIN. Try again.");
        return;
      }
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? "Failed to send email.");
        return;
      }
      const email: Email = await res.json();
      dispatch({ type: "ADD_EMAIL", email });
      setUi({
        sendPinModalOpen: false,
        composeOpen: false,
        composeDraft: EMPTY_COMPOSE_DRAFT,
      });
      setPin("");
      setError(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal onClose={close} className="max-w-[340px] p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-12 border border-hairline text-ink-icon-empty">
          <Lock size={18} strokeWidth={1.5} />
        </div>
        <p className="text-[14px] font-medium text-ink-body">
          Enter your send PIN
        </p>
        <p className="text-[12.5px] text-ink-meta">
          A PIN is required to send from {account?.email}.
        </p>
        <div className="mt-1 w-full max-w-[200px]">
          <PinInput
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            autoFocus
          />
        </div>
        {error && <p className="text-[12px] text-danger-text">{error}</p>}
        <div className="mt-2 flex w-full gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" className="flex-1" onClick={handleConfirm} disabled={sending}>
            {sending ? "Sending…" : "Confirm & send"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
