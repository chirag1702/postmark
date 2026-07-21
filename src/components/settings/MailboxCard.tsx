"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { useAppState } from "@/context/app-state-context";
import type { Mailbox } from "@/types";
import { PinEditPanel } from "./PinEditPanel";
import { SecurityToggleRow } from "./SecurityToggleRow";

interface MailboxCardProps {
  account: Mailbox;
}

export function MailboxCard({ account }: MailboxCardProps) {
  const { dispatch } = useAppState();
  const [editingSendPin, setEditingSendPin] = useState(false);
  const [editingLockPin, setEditingLockPin] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [savingSendPin, setSavingSendPin] = useState(false);
  const [sendPinError, setSendPinError] = useState<string | null>(null);
  const [savingLockPin, setSavingLockPin] = useState(false);
  const [lockPinError, setLockPinError] = useState<string | null>(null);

  async function updatePin(kind: "send" | "lock", pin: string | null) {
    const res = await fetch(`/api/mailboxes/${account.id}/${kind}-pin`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Failed to update ${kind} PIN.`);
    }
    dispatch({
      type: kind === "send" ? "SET_ACCOUNT_SEND_PIN" : "SET_ACCOUNT_LOCK_PIN",
      accountId: account.id,
      pin,
    });
  }

  const handleTurnOffSendPin = async () => {
    setSavingSendPin(true);
    setSendPinError(null);
    try {
      await updatePin("send", null);
    } catch (e) {
      setSendPinError(e instanceof Error ? e.message : "Failed to update send PIN.");
    } finally {
      setSavingSendPin(false);
    }
  };

  const handleSaveSendPin = async (pin: string) => {
    setSavingSendPin(true);
    setSendPinError(null);
    try {
      await updatePin("send", pin);
      setEditingSendPin(false);
    } catch (e) {
      setSendPinError(e instanceof Error ? e.message : "Failed to update send PIN.");
    } finally {
      setSavingSendPin(false);
    }
  };

  const handleTurnOffLockPin = async () => {
    setSavingLockPin(true);
    setLockPinError(null);
    try {
      await updatePin("lock", null);
    } catch (e) {
      setLockPinError(e instanceof Error ? e.message : "Failed to update lock PIN.");
    } finally {
      setSavingLockPin(false);
    }
  };

  const handleSaveLockPin = async (pin: string) => {
    setSavingLockPin(true);
    setLockPinError(null);
    try {
      await updatePin("lock", pin);
      setEditingLockPin(false);
    } catch (e) {
      setLockPinError(e instanceof Error ? e.message : "Failed to update lock PIN.");
    } finally {
      setSavingLockPin(false);
    }
  };

  const handleUnlink = async () => {
    setIsUnlinking(true);
    setUnlinkError(null);
    try {
      const res = await fetch(`/api/mailboxes/${account.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to unlink mailbox.");
      }
      dispatch({ type: "UNLINK_ACCOUNT", accountId: account.id });
    } catch (e) {
      setUnlinkError(
        e instanceof Error ? e.message : "Failed to unlink mailbox."
      );
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-12 border border-hairline">
      <div className="flex items-center gap-3 bg-surface-input px-4 py-3">
        <Avatar name={account.email} tone="light" size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-ink-body">
            {account.email}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-mono-label text-ink-faint">
            {account.provider}
          </p>
        </div>
        <InlineStatus
          message={unlinkError}
          type="error"
          onClear={() => setUnlinkError(null)}
        />
        <Button
          variant="danger"
          size="sm"
          disabled={isUnlinking}
          onClick={handleUnlink}
        >
          {isUnlinking ? "Unlinking…" : "Unlink"}
        </Button>
      </div>

      <SecurityToggleRow
        label="Send PIN"
        description="Require a PIN before sending from this mailbox."
        enabled={!!account.sendPin}
        editing={editingSendPin}
        disabled={savingSendPin}
        onToggleEdit={() => setEditingSendPin((v) => !v)}
        onTurnOff={handleTurnOffSendPin}
      />
      {sendPinError && (
        <div className="border-t border-hairline-row bg-surface-card px-4 py-2">
          <InlineStatus
            message={sendPinError}
            type="error"
            onClear={() => setSendPinError(null)}
          />
        </div>
      )}
      {editingSendPin && (
        <PinEditPanel onSave={handleSaveSendPin} onCancel={() => setEditingSendPin(false)} />
      )}

      <SecurityToggleRow
        label="Mailbox lock"
        description="Require a PIN to read this mailbox after it's idle."
        enabled={!!account.lockPin}
        editing={editingLockPin}
        disabled={savingLockPin}
        onToggleEdit={() => setEditingLockPin((v) => !v)}
        onTurnOff={handleTurnOffLockPin}
      />
      {lockPinError && (
        <div className="border-t border-hairline-row bg-surface-card px-4 py-2">
          <InlineStatus
            message={lockPinError}
            type="error"
            onClear={() => setLockPinError(null)}
          />
        </div>
      )}
      {editingLockPin && (
        <PinEditPanel onSave={handleSaveLockPin} onCancel={() => setEditingLockPin(false)} />
      )}
    </div>
  );
}
