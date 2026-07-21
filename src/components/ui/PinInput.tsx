import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type PinInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const PinInput = forwardRef<HTMLInputElement, PinInputProps>(
  ({ className, maxLength = 8, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={maxLength}
        className={clsx(
          "w-full rounded-10 border border-hairline-input bg-surface-input px-3.5 py-2.5 text-center text-[16px] text-ink-body tracking-pin outline-none transition-colors",
          "focus:border-ink-primary/40",
          className
        )}
        {...props}
      />
    );
  }
);
PinInput.displayName = "PinInput";
