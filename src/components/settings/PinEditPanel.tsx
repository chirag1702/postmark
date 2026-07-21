"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PinInput } from "@/components/ui/PinInput";

interface PinEditPanelProps {
  onSave: (pin: string) => void;
  onCancel: () => void;
}

export function PinEditPanel({ onSave, onCancel }: PinEditPanelProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    onSave(pin);
  };

  return (
    <div className="flex flex-col gap-2.5 border-t border-hairline-row bg-surface-input px-4 py-3">
      <div className="flex gap-2.5">
        <PinInput
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
          placeholder="New PIN"
          className="flex-1"
        />
        <PinInput
          value={confirmPin}
          onChange={(e) => {
            setConfirmPin(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
          placeholder="Confirm"
          className="flex-1"
        />
      </div>
      {error && <p className="text-[12px] text-danger-text">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave}>
          Save PIN
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
