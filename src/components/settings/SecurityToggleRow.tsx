"use client";

import { Button } from "@/components/ui/Button";

interface SecurityToggleRowProps {
  label: string;
  description: string;
  enabled: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onTurnOff: () => void;
}

export function SecurityToggleRow({
  label,
  description,
  enabled,
  editing,
  onToggleEdit,
  onTurnOff,
}: SecurityToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline-row bg-surface-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink-body">{label}</p>
        <p className="text-[12px] text-ink-meta">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onToggleEdit}>
          {editing ? "Cancel" : enabled ? "Change" : "Enable"}
        </Button>
        {enabled && !editing && (
          <Button variant="danger" size="sm" onClick={onTurnOff}>
            Turn off
          </Button>
        )}
      </div>
    </div>
  );
}
