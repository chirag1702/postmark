import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppStateProvider } from "@/context/app-state-context";
import { Sidebar } from "@/components/shell/Sidebar";
import { MainPanel } from "@/components/shell/MainPanel";
import { ComposeDrawer } from "@/components/compose/ComposeDrawer";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { MailboxConnectStatusHandler } from "@/components/settings/MailboxConnectStatusHandler";
import type { Mailbox, User } from "@/types";

export default async function MailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const initialUser: User = {
    id: user.id,
    name: profile?.name ?? "",
    loginEmail: user.email ?? "",
  };

  const { data: mailboxRows } = await supabase
    .from("mailboxes")
    .select("id, email, provider, is_default, send_pin_hash, lock_pin_hash")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const initialAccounts: Mailbox[] = (mailboxRows ?? []).map((m) => ({
    id: m.id,
    email: m.email,
    provider: m.provider,
    isDefault: m.is_default,
    sendPin: m.send_pin_hash ? "set" : null,
    lockPin: m.lock_pin_hash ? "set" : null,
    locked: false,
  }));

  return (
    <AppStateProvider initialUser={initialUser} initialAccounts={initialAccounts}>
      <div className="flex h-screen">
        <Sidebar />
        <MainPanel>{children}</MainPanel>
      </div>
      <ComposeDrawer />
      <SettingsModal />
      <Suspense fallback={null}>
        <MailboxConnectStatusHandler />
      </Suspense>
    </AppStateProvider>
  );
}
