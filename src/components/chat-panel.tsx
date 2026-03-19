"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState, useCallback, useMemo, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTripStore } from "@/lib/store";
import type { TripState, Phase } from "@/lib/types";

interface ChatPanelProps {
  tripId: string;
}

export function ChatPanel({ tripId }: ChatPanelProps) {
  const trip = useTripStore((s) => s.trip);
  const updateTripState = useTripStore((s) => s.updateTripState);
  const setPhase = useTripStore((s) => s.setPhase);
  const setTripMeta = useTripStore((s) => s.setTripMeta);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { tripId } }),
    [tripId]
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    id: tripId,
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (part.type === "tool-result" && "toolName" in part && part.toolName === "update_trip") {
          const args = ("args" in part ? part.args : {}) as {
            tripState?: string;
            phase?: Phase;
            name?: string;
            destination?: string;
            startDate?: string;
            endDate?: string;
          };
          if (args.tripState) {
            try {
              const parsed = typeof args.tripState === "string"
                ? JSON.parse(args.tripState)
                : args.tripState;
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
    }
  }, [messages, updateTripState, setPhase, setTripMeta]);

  useEffect(() => {
    if (trip?.chatHistory && trip.chatHistory.length > 0 && messages.length === 0) {
      setMessages(
        trip.chatHistory.map((m) => ({
          id: m.id || crypto.randomUUID(),
          role: m.role as "user" | "assistant",
          content: m.content,
          parts: [{ type: "text" as const, text: m.content }],
        }))
      );
    }
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    sendMessage({ text: inputValue });
    setInputValue("");
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">Travel Planner</h3>
        <p className="text-xs text-muted-foreground">Powered by GPT</p>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-10">
              <p className="text-sm">Hi! I&apos;m your travel planning assistant.</p>
              <p className="text-xs mt-1">Tell me where you want to go and I&apos;ll help plan your trip.</p>
            </div>
          )}

          {messages.map((message) => {
            const textParts = message.parts.filter(
              (p): p is { type: "text"; text: string } => p.type === "text"
            );
            const textContent = textParts.map((p) => p.text).join("");
            if (!textContent) return null;

            return (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {textContent}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-2.5 text-sm">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Tell me about your trip..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading || !inputValue.trim()} size="sm">
          Send
        </Button>
      </form>
    </div>
  );
}
