"use client";

import { useState } from "react";
import { CONNECTABLE_PROVIDERS } from "@/lib/mock-data";
import { ProviderConnectButton } from "./ProviderConnectButton";

const CONNECT_ROUTES: Partial<Record<string, string>> = {
  gmail: "/api/auth/connect/gmail",
  outlook: "/api/auth/connect/microsoft",
};

export function ProviderConnectGrid() {
  const [loadingProviderId, setLoadingProviderId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {CONNECTABLE_PROVIDERS.map((provider) => {
        const connectHref = CONNECT_ROUTES[provider.id];
        return (
          <ProviderConnectButton
            key={provider.id}
            label={provider.label}
            mark={provider.mark}
            // Gmail (Module 2) and Outlook (Module 4) have real OAuth connect flows; every
            // provider here has one, so this only ever disables on an unmapped future entry.
            // Not gated on already-linked accounts -- a user can connect multiple mailboxes
            // from the same provider (e.g. two Gmail accounts), and the backend's uniqueness
            // constraint is per-email, not per-provider.
            disabled={!connectHref}
            loading={loadingProviderId === provider.id}
            onClick={() => {
              if (!connectHref) return;
              setLoadingProviderId(provider.id);
              window.location.href = connectHref;
            }}
          />
        );
      })}
    </div>
  );
}
