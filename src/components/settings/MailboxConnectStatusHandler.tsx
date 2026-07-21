"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppState } from "@/context/app-state-context";

const PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
};

const ERROR_MESSAGES: Record<string, (label: string) => string> = {
  denied: (label) => `${label} connection was cancelled.`,
  state_mismatch: (label) =>
    `${label} connection failed a security check — please try again.`,
  already_linked: (label) => `That ${label} address is already connected.`,
  no_refresh_token: (label) =>
    `${label} didn't grant offline access — try again and accept all permissions.`,
  unknown: (label) => `Something went wrong connecting ${label}.`,
};

export function MailboxConnectStatusHandler() {
  const { setUi } = useAppState();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const mailbox = searchParams.get("mailbox");
    if (!mailbox) return;

    const label = PROVIDER_LABELS[searchParams.get("provider") ?? ""] ?? "Mailbox";

    if (mailbox === "connected") {
      setUi({
        settingsOpen: true,
        settingsActiveTab: "mailboxes",
        mailboxConnectStatus: { type: "success", message: `${label} connected.` },
      });
    } else if (mailbox === "error") {
      const reason = searchParams.get("reason") ?? "unknown";
      const buildMessage = ERROR_MESSAGES[reason] ?? ERROR_MESSAGES.unknown;
      setUi({
        settingsOpen: true,
        settingsActiveTab: "mailboxes",
        mailboxConnectStatus: { type: "error", message: buildMessage(label) },
      });
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("mailbox");
    url.searchParams.delete("reason");
    url.searchParams.delete("provider");
    router.replace(url.pathname + url.search, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}
