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
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTripStore } from "@/lib/store";
import { ChatMessage } from "@/components/chat-message";
import { StreamElapsedSlot, StreamingTimeIndicator } from "@/components/streaming-time-indicator";
import { RecommendationsPanel } from "@/components/recommendations-panel";
import type { TripState, Phase } from "@/lib/types";
import { Paperclip, X, FileText, Image as ImageIcon, Sparkles } from "lucide-react";

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

function scrollToBottom(scrollRef: RefObject<HTMLDivElement | null>) {
  requestAnimationFrame(() => {
    const viewport = scrollRef.current?.querySelector<HTMLDivElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  });
}

export function ChatPanel({ tripId }: ChatPanelProps) {
  const trip = useTripStore((s) => s.trip);
  const updateTripState = useTripStore((s) => s.updateTripState);
  const setPhase = useTripStore((s) => s.setPhase);
  const setTripMeta = useTripStore((s) => s.setTripMeta);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [streamTurn, setStreamTurn] = useState(0);

  const recCount = trip?.recommendations?.length ?? 0;
  const isBigPicture = !trip?.phase || trip.phase === "big_picture";
  const [recsOpen, setRecsOpen] = useState(false);
  const [recsNudgeDismissed, setRecsNudgeDismissed] = useState(false);
  const showRecsNudge = isBigPicture && recCount === 0 && !recsNudgeDismissed && !recsOpen;

  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

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

  const didHydrateRef = useRef(false);

  useEffect(() => {
    didHydrateRef.current = false;
  }, [trip?.id]);

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
      didHydrateRef.current = true;
    }
  // Intentionally hydrate once per trip id when local messages are empty (avoid clobbering live chat).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- trip.chatHistory/setMessages omitted; see above
  }, [trip?.id]);

  useEffect(() => {
    if (didHydrateRef.current && messages.length > 0) {
      didHydrateRef.current = false;
      scrollToBottom(scrollRef);
    }
  }, [messages.length]);

  const buildSavePayload = useCallback(() => {
    if (!trip || messages.length === 0) return null;
    const latestTrip = useTripStore.getState().trip;
    return {
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
  }, [trip, messages]);

  const saveChat = useCallback(async () => {
    const payload = buildSavePayload();
    if (!payload) return;
    const body = JSON.stringify(payload);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/trips", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (res.ok) return;
        if (res.status === 413 || attempt === 1) {
          console.warn("[chat-persist] save failed", { status: res.status });
          return;
        }
      } catch (e) {
        if (attempt === 1) {
          console.warn("[chat-persist] save error", e);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }, [buildSavePayload]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== "ready" || messages.length === 0) return;

    // Streaming just finished — flush immediately, this is the danger boundary.
    if (prev === "streaming" || prev === "submitted") {
      void saveChat();
      return;
    }
    const timer = setTimeout(saveChat, 250);
    return () => clearTimeout(timer);
  }, [status, messages.length, saveChat]);

  useEffect(() => {
    const handler = () => {
      const payload = buildSavePayload();
      if (!payload) return;
      const body = JSON.stringify(payload);
      // keepalive supports PUT and survives unload (64KB cap on most browsers).
      try {
        fetch("/api/trips", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      } catch {
        // best-effort; nothing more we can do during unload
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [buildSavePayload]);

  const lastMessage = messages[messages.length - 1];

  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles).filter(
      (f) => f.type.startsWith("image/") || f.type === "application/pdf" || f.type.startsWith("text/")
    );
    if (arr.length > 0) setAttachedFiles((prev) => [...prev, ...arr]);
  }

  function removeFile(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if ((!inputValue.trim() && attachedFiles.length === 0) || isLoading) return;
    clearError?.();
    setStreamTurn((t) => t + 1);

    const dt = new DataTransfer();
    attachedFiles.forEach((f) => dt.items.add(f));
    const fileList = dt.files.length > 0 ? dt.files : undefined;

    sendMessage({ text: inputValue, files: fileList });
    setInputValue("");
    setAttachedFiles([]);
    scrollToBottom(scrollRef);
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

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  return (
    <div
      className="h-full flex flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Travel Planner</h3>
          <p className="text-xs text-muted-foreground">Powered by GPT</p>
        </div>
        <div className="flex items-center gap-1">
          {!recsOpen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRecsOpen(true)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <Sparkles className="size-3" />
              {recCount > 0
                ? `${recCount} rec${recCount !== 1 ? "s" : ""}`
                : "Recs"}
            </Button>
          )}
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
      </div>

      {recsOpen && (
        <RecommendationsPanel
          tripId={tripId}
          collapsed={false}
          onToggle={() => setRecsOpen(false)}
        />
      )}

      <StreamElapsedSlot key={streamTurn} active={isLoading}>
        {(streamingElapsed) => (
          <>
            <ScrollArea className="flex-1 min-h-0 overflow-hidden" ref={scrollRef}>
              <div className="p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground py-10">
                    <p className="text-sm">Hi! I&apos;m your travel planning assistant.</p>
                    <p className="text-xs mt-1">
                      Tell me where you want to go and I&apos;ll help plan your trip.
                    </p>
                    {showRecsNudge && (
                      <div className="mt-4 mx-auto max-w-xs">
                        <button
                          type="button"
                          onClick={() => setRecsOpen(true)}
                          className="w-full rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10 hover:border-primary/50"
                        >
                          <div className="flex items-center gap-2 text-xs font-medium text-primary">
                            <Sparkles className="size-3.5" />
                            Have recommendations from friends?
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Add URLs, notes, or PDFs — they&apos;ll appear in your trip overview
                            and the agent will factor them in.
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecsNudgeDismissed(true)}
                          className="text-[10px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
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

      {dragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-8 py-6 text-center">
            <Paperclip className="size-6 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-primary">Drop files here</p>
            <p className="text-xs text-muted-foreground mt-1">Images, PDFs, or text files</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-3 mb-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p className="font-medium">Something went wrong</p>
          <p className="mt-0.5 opacity-90">{error.message}</p>
        </div>
      )}

      {attachedFiles.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1.5">
          {attachedFiles.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs"
            >
              {file.type.startsWith("image/") ? (
                <ImageIcon className="size-3 text-muted-foreground" />
              ) : (
                <FileText className="size-3 text-muted-foreground" />
              )}
              <span className="truncate max-w-[120px]">{file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t flex gap-2 items-end">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          title="Attach files"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="size-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.txt,.doc,.docx"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          onPaste={handlePaste}
          placeholder="Tell me about your trip..."
          disabled={isLoading}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 field-sizing-content max-h-40 overflow-y-auto"
        />
        <Button type="submit" disabled={isLoading || (!inputValue.trim() && attachedFiles.length === 0)} size="sm">
          Send
        </Button>
      </form>
    </div>
  );
}
