"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchPlayerSearchPreview,
  type PlayerSearchPreview,
} from "@/lib/playerSearchPreview";

const DEFAULT_DEBOUNCE_MS = 250;

type LiveSearchState = {
  searching: boolean;
  preview: PlayerSearchPreview | null;
  error: string | null;
};

/** Debounced live player lookup (~250ms after typing stops). */
export function useLivePlayerSearch(
  query: string,
  enabled: boolean,
  debounceMs = DEFAULT_DEBOUNCE_MS
): LiveSearchState {
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<PlayerSearchPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const resolvedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      requestIdRef.current += 1;
      resolvedQueryRef.current = null;
      setSearching(false);
      setPreview(null);
      setError(null);
      return;
    }

    // Keep an existing result if lookup is paused (blur / app switch) or
    // this exact query was already resolved — do not restart the fetch.
    if (!enabled || resolvedQueryRef.current === trimmed) {
      setSearching(false);
      return;
    }

    setSearching(true);
    setError(null);

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await fetchPlayerSearchPreview(trimmed, controller.signal);
          if (requestId !== requestIdRef.current) return;
          resolvedQueryRef.current = trimmed;
          setPreview(result);
          setError(null);
        } catch (err) {
          if (controller.signal.aborted || requestId !== requestIdRef.current) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          resolvedQueryRef.current = null;
          setPreview(null);
          setError(err instanceof Error ? err.message : "Search failed");
        } finally {
          if (requestId === requestIdRef.current) {
            setSearching(false);
          }
        }
      })();
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled, debounceMs]);

  return { searching, preview, error };
}
