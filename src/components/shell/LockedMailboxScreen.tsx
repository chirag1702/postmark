"use client";

import { FormEvent, useState } from "react";
import { Lock } from "lucide-react";
import { PinInput } from "@/components/ui/PinInput";
import { Button } from "@/components/ui/Button";
import { useAppState } from "@/context/app-state-context";
import { getActiveAccount } from "@/lib/utils";

export function LockedMailboxScreen() {
  const { mail, dispatch } = useAppState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const account = getActiveAccount(mail.accounts, mail.activeAccountId);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!account) return;
    if (pin === account.lockPin) {
      dispatch({
        type: "SET_ACCOUNT_LOCKED",
        accountId: account.id,
        locked: false,
      });
      setPin("");
      setError(null);
    } else {
      setError("Incorrect PIN. Try again.");
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-12 border border-hairline text-ink-icon-empty">
        <Lock size={20} strokeWidth={1.5} />
      </div>
      <p className="text-[14px] font-medium text-ink-body">
        This mailbox is locked
      </p>
      <p className="max-w-[260px] text-[13px] text-ink-meta">
        Enter the PIN for {account?.email} to continue.
      </p>
      <form
        onSubmit={handleSubmit}
        className="mt-1 flex w-full max-w-[220px] flex-col gap-2"
      >
        <PinInput
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
          autoFocus
        />
        {error && <p className="text-[12px] text-danger-text">{error}</p>}
        <Button type="submit" className="w-full" size="sm">
          Unlock mailbox
        </Button>
      </form>
    </div>
  );
}
