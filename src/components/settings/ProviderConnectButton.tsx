interface ProviderConnectButtonProps {
  label: string;
  mark: string;
  disabled?: boolean;
  onClick: () => void;
}

export function ProviderConnectButton({
  label,
  mark,
  disabled,
  onClick,
}: ProviderConnectButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-10 border border-hairline bg-surface-card px-3.5 py-2.5 text-left text-[13px] font-medium text-ink-button-secondary transition-colors hover:bg-surface-row-selected disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-7 border border-hairline text-[12px] font-semibold text-ink-primary">
        {mark}
      </span>
      {label}
    </button>
  );
}
