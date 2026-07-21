import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[12px] font-semibold text-ink-label"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "rounded-10 border border-hairline-input bg-surface-input px-3.5 py-2.5 text-[14px] text-ink-body outline-none transition-colors",
            "focus:border-ink-primary/40",
            className
          )}
          {...props}
        />
        {error && <p className="text-[12px] text-danger-text">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
