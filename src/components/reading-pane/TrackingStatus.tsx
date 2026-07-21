import { Dot } from "@/components/ui/Dot";
import { trackingSummary } from "@/lib/utils";
import type { Tracking } from "@/types";

interface TrackingStatusProps {
  tracking: Tracking;
}

export function TrackingStatus({ tracking }: TrackingStatusProps) {
  const opened = tracking.opens.length > 0;

  return (
    <div className="flex w-fit items-center gap-2 rounded-9 bg-surface-search px-3 py-2">
      <Dot size={8} filled={opened} pulse={opened} color="var(--color-ink-primary)" />
      <span className="font-mono text-[11px] tracking-mono-label text-ink-muted">
        {trackingSummary(tracking)}
      </span>
    </div>
  );
}
