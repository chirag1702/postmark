"use client";

import { Mail } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppState } from "@/context/app-state-context";
import { useEmailDetail } from "@/hooks/useEmailDetail";
import { getSelectedEmail } from "@/lib/utils";
import { EmailDetail } from "./EmailDetail";

export function ReadingPane() {
  const { mail } = useAppState();
  useEmailDetail();
  const email = getSelectedEmail(mail.emails, mail.selectedEmailId);

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      {email ? (
        <EmailDetail email={email} />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<Mail size={20} strokeWidth={1.5} />}
            title="Select a conversation to read"
          />
        </div>
      )}
    </section>
  );
}
