"use client";

import { useEffect } from "react";
import clsx from "clsx";

interface InlineStatusProps {
  message: string | null;
  type?: "success" | "error";
  onClear?: () => void;
  className?: string;
}

export function InlineStatus({
  message,
  type = "success",
  onClear,
  className,
}: InlineStatusProps) {
  useEffect(() => {
    if (!message || !onClear) return;
    const timer = setTimeout(onClear, 2600);
    return () => clearTimeout(timer);
  }, [message, onClear]);

  if (!message) return null;

  return (
    <span
      className={clsx(
        "text-[13px] font-medium",
        type === "success" ? "text-success-text" : "text-danger-text",
        className
      )}
    >
      {message}
    </span>
  );
}
