"use client";

import { Check } from "lucide-react";
import clsx from "clsx";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export function Checkbox({ checked, onChange, label, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        className
      )}
    >
      <span
        className={clsx(
          "flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-5 border transition-colors",
          checked
            ? "border-ink-primary bg-ink-primary"
            : "border-hairline-strong bg-surface-card"
        )}
      >
        {checked && <Check size={12} strokeWidth={3} className="text-ink-on-dark" />}
      </span>
      {label && <span className="text-[13px] text-ink-body">{label}</span>}
    </button>
  );
}
