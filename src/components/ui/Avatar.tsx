import clsx from "clsx";
import { initials } from "@/lib/utils";

interface AvatarProps {
  name: string;
  shape?: "square" | "circle";
  tone?: "dark" | "light";
  size?: number;
  className?: string;
}

export function Avatar({
  name,
  shape = "square",
  tone = "light",
  size = 32,
  className,
}: AvatarProps) {
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center font-semibold select-none",
        shape === "circle" ? "rounded-full" : "rounded-9",
        tone === "dark"
          ? "bg-ink-primary text-ink-on-dark"
          : "bg-surface-avatar-light text-ink-avatar-initials",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </div>
  );
}
