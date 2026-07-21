import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "font-semibold bg-ink-primary text-ink-on-dark border border-transparent hover:bg-black",
  secondary:
    "font-medium bg-surface-card text-ink-button-secondary border border-hairline hover:bg-surface-row-selected",
  danger:
    "font-medium bg-surface-card text-danger-text border border-hairline hover:bg-danger-bg hover:border-danger-border",
  ghost:
    "font-medium bg-transparent text-ink-faint border border-transparent hover:text-ink-primary px-1",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-[13px] px-3 py-1.5 rounded-9",
  md: "text-[14px] px-4 py-2.5 rounded-10",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
          variant !== "ghost" && sizeClasses[size],
          variantClasses[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
