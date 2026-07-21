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
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, loginEmail: email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to save changes.");
      }
      dispatch({ type: "UPDATE_USER", patch: { name: body.name } });
      if (body.emailChangePending) {
        setEmail(body.loginEmail);
        setStatus({
          message: "Display name updated — check your inbox to confirm your new email.",
          type: "success",
        });
      } else {
        dispatch({ type: "UPDATE_USER", patch: { loginEmail: body.loginEmail } });
        setStatus({ message: "Changes saved.", type: "success" });
      }
    } catch (e) {
      setStatus({
        message: e instanceof Error ? e.message : "Failed to save changes.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
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
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <InlineStatus
            message={status?.message ?? null}
            type={status?.type}
            onClear={() => setStatus(null)}
          />
        </div>
      </form>
    </div>
  );
}
