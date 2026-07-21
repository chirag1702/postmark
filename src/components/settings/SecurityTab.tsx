"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InlineStatus } from "@/components/ui/InlineStatus";
import { Input } from "@/components/ui/Input";

export function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!current || !next) {
      setStatus({ message: "Fill in all fields.", type: "error" });
      return;
    }
    if (next !== confirm) {
      setStatus({ message: "New passwords don't match.", type: "error" });
      return;
    }
    setStatus({ message: "Password updated.", type: "success" });
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  return (
    <div className="flex flex-col gap-6 p-7">
      <div>
        <h3 className="text-[15px] font-semibold text-ink-primary">
          Password
        </h3>
        <p className="mt-1 text-[13px] text-ink-meta">
          Update the password for your master account.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex max-w-[360px] flex-col gap-3.5">
        <Input
          label="Current password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Input
          label="New password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Input
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <div className="mt-1 flex items-center gap-3">
          <Button type="submit" size="sm">
            Update password
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
