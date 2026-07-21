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
        onToggleEdit={() => setEditingSendPin((v) => !v)}
        onTurnOff={() =>
          dispatch({
            type: "SET_ACCOUNT_SEND_PIN",
            accountId: account.id,
            pin: null,
          })
        }
      />
      {editingSendPin && (
        <PinEditPanel
          onSave={(pin) => {
            dispatch({
              type: "SET_ACCOUNT_SEND_PIN",
              accountId: account.id,
              pin,
            });
            setEditingSendPin(false);
          }}
          onCancel={() => setEditingSendPin(false)}
        />
      )}

      <SecurityToggleRow
        label="Mailbox lock"
        description="Require a PIN to read this mailbox after it's idle."
        enabled={!!account.lockPin}
        editing={editingLockPin}
        onToggleEdit={() => setEditingLockPin((v) => !v)}
        onTurnOff={() =>
          dispatch({
            type: "SET_ACCOUNT_LOCK_PIN",
            accountId: account.id,
            pin: null,
          })
        }
      />
      {editingLockPin && (
        <PinEditPanel
          onSave={(pin) => {
            dispatch({
              type: "SET_ACCOUNT_LOCK_PIN",
              accountId: account.id,
              pin,
            });
            setEditingLockPin(false);
          }}
          onCancel={() => setEditingLockPin(false)}
        />
      )}
    </div>
  );
}
