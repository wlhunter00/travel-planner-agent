"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTripStore } from "@/lib/store";
import { ChatMessage } from "@/components/chat-message";
import { StreamElapsedSlot, StreamingTimeIndicator } from "@/components/streaming-time-indicator";
import type { TripState, Phase } from "@/lib/types";

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ChatPanelProps {
  tripId: string;
}

function extractUpdateTripPayload(part: unknown): Record<string, unknown> | null {
  if (typeof part !== "object" || part === null) return null;
  const p = part as Record<string, unknown>;
  if (p.type === "tool-result" && p.toolName === "update_trip") {
    const fromArgs = p.args;
    if (fromArgs && typeof fromArgs === "object") return fromArgs as Record<string, unknown>;
    const fromResult = p.result;
    if (fromResult && typeof fromResult === "object") return fromResult as Record<string, unknown>;
    return null;
  }
  const asPart = part as UIMessage["parts"][number];
  if (isToolUIPart(asPart) && getToolName(asPart) === "update_trip") {
    if ("state" in asPart && asPart.state === "output-available" && "output" in asPart) {
      const out = asPart.output;
      if (out && typeof out === "object") return out as Record<string, unknown>;
    }
  }
  return null;
}

function ScrollToBottomOnActivity({
  messagesLen,
  isLoading,
  streamingElapsed,
  scrollRef,
}: {
  messagesLen: number;
  isLoading: boolean;
  streamingElapsed: number;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesLen, isLoading, streamingElapsed, scrollRef]);
  return null;
}

export function ChatPanel({ tripId }: ChatPanelProps) {
  const trip = useTripStore((s) => s.trip);
  const updateTripState = useTripStore((s) => s.updateTripState);
  const setPhase = useTripStore((s) => s.setPhase);
  const setTripMeta = useTripStore((s) => s.setTripMeta);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [streamTurn, setStreamTurn] = useState(0);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { tripId } }),
    [tripId]
  );

  const { messages, sendMessage, status, setMessages, error, clearError } = useChat({
    id: tripId,
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        const payload = extractUpdateTripPayload(part);
        if (!payload) continue;
        const args = payload as {
          tripState?: string;
          phase?: Phase;
          name?: string;
          destination?: string;
          startDate?: string;
          endDate?: string;
        };
        if (args.tripState) {
          try {
            const parsed =
              typeof args.tripState === "string" ? JSON.parse(args.tripState) : args.tripState;
            updateTripState(parsed as Partial<TripState>);
          } catch {
            // ignore
          }
        }
        if (args.phase) setPhase(args.phase);
        const meta: Record<string, string> = {};
        if (args.name) meta.name = args.name;
        if (args.destination) meta.destination = args.destination;
        if (args.startDate) meta.startDate = args.startDate;
        if (args.endDate) meta.endDate = args.endDate;
        if (Object.keys(meta).length > 0) setTripMeta(meta);
      }
    }
  }, [messages, updateTripState, setPhase, setTripMeta]);

  useEffect(() => {
    if (trip?.chatHistory && trip.chatHistory.length > 0 && messages.length === 0) {
      setMessages(
        trip.chatHistory.map((m) => ({
          id: m.id || crypto.randomUUID(),
          role: m.role as "user" | "assistant",
          parts:
            m.parts && m.parts.length > 0
              ? (m.parts as UIMessage["parts"])
              : [{ type: "text" as const, text: m.content }],
        }))
      );
    }
  // Intentionally hydrate once per trip id when local messages are empty (avoid clobbering live chat).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- trip.chatHistory/setMessages omitted; see above
  }, [trip?.id]);

  const saveChat = useCallback(async () => {
    if (!trip || messages.length === 0) return;
    const latestTrip = useTripStore.getState().trip;
    const payload = {
      ...trip,
      ...latestTrip,
      chatHistory: messages.map((m) => ({
        role: m.role,
        content: m.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(""),
        id: m.id,
        parts: m.parts.map((p) => ({ ...p })),
      })),
      updatedAt: new Date().toISOString(),
    };
    await fetch("/api/trips", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }, [trip, messages]);

  useEffect(() => {
    if (status === "ready" && messages.length > 0) {
      const timer = setTimeout(saveChat, 1000);
      return () => clearTimeout(timer);
    }
  }, [status, messages.length, saveChat]);

  const lastMessage = messages[messages.length - 1];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    clearError?.();
    setStreamTurn((t) => t + 1);
    sendMessage({ text: inputValue });
    setInputValue("");
  }

  function handleExportChat() {
    const exportData = {
      tripId,
      tripName: trip?.name ?? "unknown",
      phase: trip?.phase ?? "unknown",
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
      })),
    };
    const slug = (trip?.name ?? tripId).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadJSON(exportData, `chat-debug-${slug}.json`);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Travel Planner</h3>
          <p className="text-xs text-muted-foreground">Powered by GPT</p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportChat}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Export chat for debugging"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </Button>
        )}
      </div>

      <StreamElapsedSlot key={streamTurn} active={isLoading}>
        {(streamingElapsed) => (
          <>
            <ScrollToBottomOnActivity
              messagesLen={messages.length}
              isLoading={isLoading}
              streamingElapsed={streamingElapsed}
              scrollRef={scrollRef}
            />
            <ScrollArea className="flex-1" ref={scrollRef}>
              <div className="p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-10">
                    <p className="text-sm">Hi! I&apos;m your travel planning assistant.</p>
                    <p className="text-xs mt-1">
                      Tell me where you want to go and I&apos;ll help plan your trip.
                    </p>
                  </div>
                )}

                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message as UIMessage}
                    isStreamingAssistant={
                      isLoading && message.role === "assistant" && message.id === lastMessage?.id
                    }
                  />
                ))}

                {isLoading && lastMessage?.role === "user" ? (
                  <div className="flex justify-start animate-agent-part-in">
                    <div className="shimmer-border max-w-[85%] space-y-1.5 rounded-xl border border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                        Starting agent…
                      </span>
                      <StreamingTimeIndicator elapsed={streamingElapsed} className="pl-4" />
                    </div>
                  </div>
                ) : null}

                {isLoading && lastMessage?.role === "assistant" ? (
                  <div className="flex justify-start animate-agent-part-in">
                    <div className="max-w-[85%] w-full border-t border-border/30 pt-2">
                      <StreamingTimeIndicator elapsed={streamingElapsed} />
                    </div>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </>
        )}
      </StreamElapsedSlot>

      {error && (
        <div className="mx-3 mb-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p className="font-medium">Something went wrong</p>
          <p className="mt-0.5 opacity-90">{error.message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2 items-end">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder="Tell me about your trip..."
          disabled={isLoading}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 field-sizing-content max-h-40 overflow-y-auto"
        />
        <Button type="submit" disabled={isLoading || !inputValue.trim()} size="sm">
          Send
        </Button>
      </form>
    </div>
  );
}
