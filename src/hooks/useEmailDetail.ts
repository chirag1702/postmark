"use client";

import { useEffect } from "react";
import { useAppState } from "@/context/app-state-context";
import type { Email } from "@/types";

/** Re-fetches the selected email whenever it changes, so TrackingStatus reflects opens/clicks
 * that happened after the list was first loaded (re-selecting an email refreshes it). */
export function useEmailDetail() {
  const { mail, dispatch } = useAppState();
  const { selectedEmailId } = mail;

  useEffect(() => {
    if (!selectedEmailId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/mail/${selectedEmailId}`);
        if (!res.ok || cancelled) return;
        const email: Email = await res.json();
        if (!cancelled) {
          dispatch({ type: "UPDATE_EMAIL", email });
        }
      } catch {
        // Keep whatever was already in state on failure.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmailId]);
}
