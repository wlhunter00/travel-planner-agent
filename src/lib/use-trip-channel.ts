"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ChatMessage } from "./types";

export interface SavedBroadcast {
  history: ChatMessage[];
  updatedAt: string;
}

type ChannelKind = "trip" | "conversation";

/**
 * BroadcastChannel-based live sync for chat-style records. Used by ChatPanel
 * (kind="trip") and ConversationPanel (kind="conversation") to push fresh
 * history to other open tabs viewing the same record after a successful save.
 *
 * Falls back to a no-op when BroadcastChannel is unavailable (SSR, old
 * browsers). The `onRemoteSaved` callback is stored in a ref so callers can
 * pass an unstable handler without forcing the channel to reopen.
 */
function useSavedChannel(
  kind: ChannelKind,
  id: string | null | undefined,
  onRemoteSaved?: (msg: SavedBroadcast) => void,
) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const callbackRef = useRef(onRemoteSaved);
  useEffect(() => {
    callbackRef.current = onRemoteSaved;
  }, [onRemoteSaved]);

  useEffect(() => {
    if (!id) return;
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return;
    }
    const ch = new BroadcastChannel(`${kind}-${id}`);
    channelRef.current = ch;
    ch.onmessage = (e: MessageEvent) => {
      const data = e.data as Partial<SavedBroadcast> | null;
      if (!data || !Array.isArray(data.history) || typeof data.updatedAt !== "string") {
        return;
      }
      callbackRef.current?.(data as SavedBroadcast);
    };
    return () => {
      ch.close();
      if (channelRef.current === ch) channelRef.current = null;
    };
  }, [kind, id]);

  const broadcastSaved = useCallback(
    (history: ChatMessage[], updatedAt: string) => {
      const ch = channelRef.current;
      if (!ch) return;
      try {
        ch.postMessage({ history, updatedAt } satisfies SavedBroadcast);
      } catch {
        // best-effort
      }
    },
    [],
  );

  return { broadcastSaved };
}

export function useTripChannel(
  tripId: string | null | undefined,
  onRemoteSaved?: (msg: SavedBroadcast) => void,
) {
  return useSavedChannel("trip", tripId, onRemoteSaved);
}

export function useConversationChannel(
  conversationId: string | null | undefined,
  onRemoteSaved?: (msg: SavedBroadcast) => void,
) {
  return useSavedChannel("conversation", conversationId, onRemoteSaved);
}
