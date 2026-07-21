import clsx from "clsx";
import { Loader2 } from "lucide-react";

interface ProviderConnectButtonProps {
  label: string;
  mark: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}

export function ProviderConnectButton({
  label,
  mark,
  disabled,
  loading,
  onClick,
}: ProviderConnectButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2.5 rounded-10 border border-hairline bg-surface-card px-3.5 py-2.5 text-left text-[13px] font-medium text-ink-button-secondary transition-colors hover:bg-surface-row-selected disabled:cursor-not-allowed",
        !loading && "disabled:opacity-40"
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-7 border border-hairline text-[12px] font-semibold text-ink-primary">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mark}
      </span>
      {label}
    </button>
  );
}
