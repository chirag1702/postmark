"use client";

import { FormEvent, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { Input } from "@/components/ui/Input";
import { useAppState } from "@/context/app-state-context";

export function AccountTab() {
  const { mail, dispatch } = useAppState();
  const [name, setName] = useState(mail.user.name);
  const [email, setEmail] = useState(mail.user.loginEmail);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    dispatch({ type: "UPDATE_USER", patch: { name, loginEmail: email } });
    setSuccess("Changes saved.");
  };

  return (
    <div className="flex flex-col gap-6 p-7">
      <div className="flex items-center gap-3">
        <Avatar name={mail.user.name} tone="dark" size={44} />
        <div>
          <p className="text-[15px] font-semibold text-ink-primary">
            {mail.user.name}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-mono-label-wide text-ink-faint">
            Master account
          </p>
        </div>
      </div>
      <form onSubmit={handleSave} className="flex max-w-[360px] flex-col gap-3.5">
        <Input
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Login email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="mt-1 flex items-center gap-3">
          <Button type="submit" size="sm">
            Save changes
          </Button>
          <InlineStatus message={success} onClear={() => setSuccess(null)} />
        </div>
      </form>
    </div>
  );
}
