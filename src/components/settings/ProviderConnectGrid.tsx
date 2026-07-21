"use client";

import { useAppState } from "@/context/app-state-context";
import { CONNECTABLE_PROVIDERS } from "@/lib/mock-data";
import { ProviderConnectButton } from "./ProviderConnectButton";

const CONNECT_ROUTES: Partial<Record<string, string>> = {
  gmail: "/api/auth/connect/gmail",
  outlook: "/api/auth/connect/microsoft",
};

export function ProviderConnectGrid() {
  const { mail } = useAppState();
  const linkedProviders = new Set(mail.accounts.map((a) => a.provider));

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {CONNECTABLE_PROVIDERS.map((provider) => {
        const connectHref = CONNECT_ROUTES[provider.id];
        return (
          <ProviderConnectButton
            key={provider.id}
            label={provider.label}
            mark={provider.mark}
            // Gmail (Module 2) and Outlook (Module 4) have real OAuth connect flows.
            // Hotmail/iCloud remain out of scope. Disabled rather than left fabricating
            // a client-only mailbox, which would vanish on next navigation now that
            // `accounts` is server-hydrated.
            disabled={!connectHref || linkedProviders.has(provider.id)}
            onClick={() => {
              if (connectHref) window.location.href = connectHref;
            }}
          />
        );
      })}
    </div>
  );
}
