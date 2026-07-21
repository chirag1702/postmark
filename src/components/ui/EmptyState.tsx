import { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-12 border border-hairline text-ink-icon-empty">
        {icon}
      </div>
      <p className="text-[14px] font-medium text-ink-muted">{title}</p>
      {description && (
        <p className="max-w-[280px] text-[13px] text-ink-meta">{description}</p>
      )}
      {action}
    </div>
  );
}
