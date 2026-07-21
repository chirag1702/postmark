import { Avatar } from "@/components/ui/Avatar";
import type { EmailAddress } from "@/types";

interface SenderRowProps {
  from: EmailAddress;
}

export function SenderRow({ from }: SenderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={from.name || from.email} tone="light" size={36} />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-ink-primary">
          {from.name}
        </p>
        <p className="truncate text-[12.5px] text-ink-meta">{from.email}</p>
      </div>
    </div>
  );
}
