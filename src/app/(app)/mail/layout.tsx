import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppStateProvider } from "@/context/app-state-context";
import { Sidebar } from "@/components/shell/Sidebar";
import { MainPanel } from "@/components/shell/MainPanel";
import { ComposeDrawer } from "@/components/compose/ComposeDrawer";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { MailboxConnectStatusHandler } from "@/components/settings/MailboxConnectStatusHandler";
import { MAILBOX_SELECT, shapeMailbox, type MailboxRow } from "@/lib/mailboxes/shape";
import { getUnlockedMailboxIds } from "@/lib/mailboxes/session-unlocks";
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
    .select(MAILBOX_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const unlockedMailboxIds = await getUnlockedMailboxIds(supabase, user.id);

  const initialAccounts: Mailbox[] = (mailboxRows ?? []).map((m) =>
    shapeMailbox(m as unknown as MailboxRow, unlockedMailboxIds)
  );

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
