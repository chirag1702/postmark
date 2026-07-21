"use client";

import { Mail } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useAppState } from "@/context/app-state-context";

export function EmptyMailboxScreen() {
  const { setUi } = useAppState();

  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={<Mail size={22} strokeWidth={1.5} />}
        title="No mailboxes connected"
        description="Connect a mailbox to start sending and tracking email."
        action={
          <Button
            size="sm"
            className="mt-1"
            onClick={() =>
              setUi({ settingsOpen: true, settingsActiveTab: "mailboxes" })
            }
          >
            Connect a mailbox
          </Button>
        }
      />
    </div>
  );
}
