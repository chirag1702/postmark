"use client";

import { useAppState } from "@/context/app-state-context";
import { ComposeBody } from "./ComposeBody";
import { ComposeFields } from "./ComposeFields";
import { ComposeFooter } from "./ComposeFooter";
import { ComposeHeader } from "./ComposeHeader";
import { SendPinModal } from "./SendPinModal";

export function ComposeDrawer() {
  const { ui } = useAppState();

  if (!ui.composeOpen) return null;

  return (
    <>
      <div className="fixed bottom-0 right-6 z-40 flex w-[552px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-t-[16px] border border-b-0 border-hairline bg-surface-card shadow-compose-drawer animate-compose-in">
        <ComposeHeader />
        <ComposeFields />
        <ComposeBody />
        <ComposeFooter />
      </div>
      {ui.sendPinModalOpen && <SendPinModal />}
    </>
  );
}
