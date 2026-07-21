"use client";

import { Plus } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { AccountSwitcherPopover } from "@/components/account-switcher/AccountSwitcherPopover";
import { AccountSwitcherTrigger } from "@/components/account-switcher/AccountSwitcherTrigger";
import { useAppState } from "@/context/app-state-context";
import { FolderNav } from "./FolderNav";

export function Sidebar() {
  const { ui, setUi } = useAppState();

  return (
    <aside className="flex w-[236px] shrink-0 flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <BrandMark size={26} />
        <span className="text-[15px] font-semibold tracking-heading text-ink-primary">
          Postmark
        </span>
      </div>
      <div className="px-3 pb-4">
        <Button
          className="w-full shadow-compose-btn"
          onClick={() => setUi({ composeOpen: true })}
        >
          <Plus size={15} strokeWidth={2.5} />
          Compose
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <FolderNav />
      </div>
      <div className="relative mt-auto px-3 pb-3 pt-2">
        <AccountSwitcherTrigger
          onClick={() => setUi({ accountSwitcherOpen: !ui.accountSwitcherOpen })}
        />
        {ui.accountSwitcherOpen && <AccountSwitcherPopover />}
      </div>
    </aside>
  );
}
