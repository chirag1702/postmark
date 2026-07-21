import { ReactNode } from "react";
import { BrandMark } from "@/components/ui/BrandMark";

interface AuthCardProps {
  children: ReactNode;
}

export function AuthCard({ children }: AuthCardProps) {
  return (
    <div className="w-full max-w-[396px] rounded-18 border border-hairline bg-surface-card p-8 shadow-auth-card animate-pop-in">
      <div className="mb-6 flex items-center gap-2.5">
        <BrandMark size={28} />
        <span className="text-[17px] font-semibold tracking-heading text-ink-primary">
          Postmark
        </span>
      </div>
      {children}
    </div>
  );
}
