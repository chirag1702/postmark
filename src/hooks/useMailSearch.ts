"use client";

import { useEffect, useRef, useState } from "react";
import type { Email } from "@/types";

const DEBOUNCE_MS = 300;

interface UseMailSearchResult {
  results: Email[];
  loading: boolean;
  error: boolean;
}

/** Debounced server-side cross-account search backing EmailList's search-mode rendering. Guards
 * against out-of-order responses via a monotonically increasing request id. */
export function useMailSearch(query: string): UseMailSearchResult {
  const [results, setResults] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++requestIdRef.current;

    // No query: nothing to fetch. Stale results/loading from a prior query are left as-is
    // (harmless -- EmailList only reads them while a query is active) rather than reset here,
    // which would mean calling setState synchronously in the effect body.
    if (!trimmed) {
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/mail/search?q=${encodeURIComponent(trimmed)}`);
        if (requestIdRef.current !== requestId) return;
        if (!res.ok) {
          setError(true);
          setResults([]);
          return;
        }
        setResults(await res.json());
      } catch {
        if (requestIdRef.current === requestId) setError(true);
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, loading, error };
}
