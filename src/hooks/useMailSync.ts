"use client";

import { useEffect } from "react";
import { useAppState } from "@/context/app-state-context";
import type { Email } from "@/types";

const POLL_INTERVAL_MS = 30_000;

async function fetchAccountEmails(
  accountId: string,
  dispatch: ReturnType<typeof useAppState>["dispatch"],
  isCancelled: () => boolean
) {
  try {
    const res = await fetch(`/api/mail?mailboxId=${accountId}`);
    if (!res.ok || isCancelled()) return;
    const emails: Email[] = await res.json();
    if (!isCancelled()) {
      dispatch({ type: "SET_EMAILS_FOR_ACCOUNT", accountId, emails });
    }
  } catch {
    // Skip this account for this pass; the next poll tick (or, for the initial load, nothing --
    // no retry affordance for a one-shot failure) will pick it up.
  }
}

/** Fetches every connected mailbox's emails so list/count components (EmailList, FolderNav,
 * AccountSwitcherPopover) have real data instead of only ever-appended local state. */
export function useMailSync() {
  const { mail, dispatch } = useAppState();
  const accountIds = mail.accounts.map((a) => a.id).join(",");

  // Initial load: fetch any account not yet in state, once.
  useEffect(() => {
    const pending = mail.accounts.filter((a) => !mail.emailsLoaded[a.id]);
    if (pending.length === 0) return;

    let cancelled = false;
    pending.forEach((account) => fetchAccountEmails(account.id, dispatch, () => cancelled));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIds]);

  // Ongoing poll: re-fetch already-loaded accounts periodically -- inbound folders are fetched
  // live from the provider on every call, so this is what surfaces new mail without a manual
  // page reload. This is a cheap client-side refresh, not a replacement for real push (a future
  // module).
  useEffect(() => {
    const loaded = mail.accounts.filter((a) => mail.emailsLoaded[a.id]);
    if (loaded.length === 0) return;

    let cancelled = false;
    const interval = setInterval(() => {
      loaded.forEach((account) => fetchAccountEmails(account.id, dispatch, () => cancelled));
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIds]);
}
