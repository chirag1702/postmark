"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppState } from "@/context/app-state-context";

interface SyncStateChangePayload {
  new: {
    mailbox_id: string;
    backfill_complete: boolean;
  };
}

/** Subscribes to `sync_state` UPDATEs so the "Setting up your mailbox" screen (and the
 * account switcher / Settings indicators reading the same `backfillComplete` flag) clear the
 * moment the backfill job finishes, instead of requiring a manual reload. Mounted at the layout
 * level (not inside MainPanel's children) since that's the only place guaranteed to render while
 * the setting-up screen itself is showing. */
export function BackfillStatusListener() {
  const { dispatch } = useAppState();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("sync_state-backfill")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sync_state" },
        (payload: SyncStateChangePayload) => {
          dispatch({
            type: "SET_ACCOUNT_BACKFILL_COMPLETE",
            accountId: payload.new.mailbox_id,
            backfillComplete: payload.new.backfill_complete,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dispatch]);

  return null;
}
