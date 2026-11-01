"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError } from "@/contracts";
import type { AsyncData } from "@/components/contracts";
import { NotImplementedError } from "./not-implemented";
import { AliasApiError } from "./api-client";

export function toApiError(error: unknown): ApiError {
  if (error instanceof AliasApiError) return error.detail;
  if (error instanceof NotImplementedError) return { code: "NOT_IMPLEMENTED", message: error.message, retryable: false };
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return { code: "INTERNAL_ERROR", message, retryable: true };
}

/** Fetch every page of a cursor-paginated list. */
export async function listAll<T>(load: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const result = await load(cursor);
    items.push(...result.items);
    cursor = result.nextCursor;
  } while (cursor !== null);
  return items;
}

export type Resource<T> = AsyncData<T> & {
  reload: () => Promise<void>;
  setData: (update: T | null | ((current: T | null) => T | null)) => void;
};

/** Loads data when `key` changes. Pass `null` as key to skip loading. Stale responses are dropped. */
export function useResource<T>(key: string | null, load: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<AsyncData<T> & { key: string | null }>({ key, data: null, loading: key !== null, error: null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    if (key === null) return;
    const request = ++requestRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loadRef.current();
      if (request === requestRef.current) setState({ key, data, loading: false, error: null });
    } catch (error) {
      if (request === requestRef.current) setState((s) => ({ ...s, loading: false, error: toApiError(error) }));
    }
  }, [key]);

  useEffect(() => {
    setState({ key, data: null, loading: key !== null, error: null });
    if (key === null) return;
    void reload();
    return () => { requestRef.current++; };
  }, [key, reload]);

  const setData = useCallback((update: T | null | ((current: T | null) => T | null)) => {
    // A read started before this mutation must not overwrite the saved result.
    requestRef.current++;
    setState((s) => ({ key, loading: false, error: null, data: typeof update === "function" ? (update as (c: T | null) => T | null)(s.key === key ? s.data : null) : update }));
  }, [key]);

  const visible = state.key === key ? state : { data: null, loading: key !== null, error: null };
  return { ...visible, reload, setData };
}

/** Repeatedly calls `poll` every `intervalMs` while `active` is true. Stops on unmount or when `active` turns false. */
export function usePolling(active: boolean, poll: () => Promise<void>, intervalMs = 1500) {
  const pollRef = useRef(poll);
  pollRef.current = poll;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        await pollRef.current();
      } catch {
        // Poll callbacks surface errors through their resource state; keep retrying.
      } finally {
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    };
    timer = setTimeout(tick, intervalMs);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, intervalMs]);
}

export const isTerminal = (status: "queued" | "running" | "completed" | "failed") =>
  status === "completed" || status === "failed";
