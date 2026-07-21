"use client";

import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useAppState } from "@/context/app-state-context";
import { AccountTab } from "./AccountTab";
import { LinkedMailboxesTab } from "./LinkedMailboxesTab";
import { SecurityTab } from "./SecurityTab";
import { SettingsNav } from "./SettingsNav";

export function SettingsModal() {
  const { ui, setUi } = useAppState();

  const close = () => setUi({ settingsOpen: false });

  if (!ui.settingsOpen) return null;

  return (
    <Modal
      onClose={close}
      className="relative flex h-[min(660px,90vh)] max-w-[900px] overflow-hidden"
    >
      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-row-selected hover:text-ink-primary"
      >
        <X size={15} />
      </button>
      <SettingsNav />
      <div className="flex-1 overflow-y-auto">
        {ui.settingsActiveTab === "account" && <AccountTab />}
        {ui.settingsActiveTab === "security" && <SecurityTab />}
        {ui.settingsActiveTab === "mailboxes" && <LinkedMailboxesTab />}
      </div>
    </Modal>
  );
}
