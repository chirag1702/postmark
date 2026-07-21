import clsx from "clsx";

interface DotProps {
  size?: number;
  filled?: boolean;
  color?: string;
  pulse?: boolean;
  className?: string;
}

export function Dot({
  size = 7,
  filled = true,
  color = "var(--color-ink-primary)",
  pulse = false,
  className,
}: DotProps) {
  return (
    <span
      className={clsx(
        "inline-block shrink-0 rounded-full",
        pulse && "animate-pulse-seen",
        className
      )}
      style={
        filled
          ? { width: size, height: size, background: color }
          : {
              width: size,
              height: size,
              border: `1.5px solid ${color}`,
              background: "transparent",
            }
      }
    />
  );
}
