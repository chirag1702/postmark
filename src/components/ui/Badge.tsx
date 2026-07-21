import clsx from "clsx";

interface BadgeProps {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}

export function Badge({ children, active, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "font-mono text-[11px] tracking-mono-label",
        active ? "text-ink-primary" : "text-ink-faint",
        className
      )}
    >
      {children}
    </span>
  );
}
