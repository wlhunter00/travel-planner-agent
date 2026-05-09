"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  VirtualizedMessageList,
  type VirtualMessageListHandle,
} from "@/components/virtualized-message-list";
import { StreamElapsedSlot, StreamingTimeIndicator } from "@/components/streaming-time-indicator";
import type { ChatMessage as ChatMsg } from "@/lib/types";
import { capMessagesToolOutputs } from "@/lib/chat-context";
import { Paperclip, X, FileText, Image as ImageIcon, Square } from "lucide-react";

interface ConversationPanelProps {
  conversationId: string;
  initialTitle: string;
  initialMessages: ChatMsg[];
}

export function ConversationPanel({
  conversationId,
  initialTitle,
  initialMessages,
}: ConversationPanelProps) {
  const listRef = useRef<VirtualMessageListHandle>(null);
  const [inputValue, setInputValue] = useState("");
  const [streamTurn, setStreamTurn] = useState(0);
  const [title, setTitle] = useState(initialTitle);

  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/conversations/chat" }),
    []
  );

  const { messages, sendMessage, status, setMessages, error, clearError, stop } = useChat({
    id: conversationId,
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; });

  const didHydrateRef = useRef(false);

  useEffect(() => {
    didHydrateRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      setMessages(
        initialMessages.map((m) => ({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (didHydrateRef.current && messages.length > 0) {
      didHydrateRef.current = false;
      listRef.current?.scrollToBottom();
    }
  }, [messages.length]);

  const saveConversation = useCallback(
    async (msgs: UIMessage[]) => {
      const chatHistory = msgs.map((m) => ({
        role: m.role,
        content: m.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(""),
        id: m.id,
        parts: m.parts.map((p) => ({ ...p })),
      }));

      await fetch("/api/conversations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conversationId, messages: chatHistory }),
      });
    },
    [conversationId]
  );

  const autoTitle = useCallback(
    async (msgs: UIMessage[]) => {
      if (title !== "New Conversation") return;
      const userMsg = msgs.find((m) => m.role === "user");
      const assistantMsg = msgs.find((m) => m.role === "assistant");
      if (!userMsg || !assistantMsg) return;

      const userText = userMsg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
      const assistantText = assistantMsg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("")
        .slice(0, 300);

      try {
        const res = await fetch("/api/conversations/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            userMessage: userText.slice(0, 500),
            assistantMessage: assistantText,
          }),
        });
        if (res.ok) {
          const { title: newTitle } = await res.json();
          if (newTitle) setTitle(newTitle);
        }
      } catch {
        // non-critical
      }
    },
    [conversationId, title]
  );

  const prevStatusRef = useRef<typeof status | null>(null);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const currentMessages = messagesRef.current;
    if (status !== "ready" || currentMessages.length === 0) return;

    if (prev === "streaming" || prev === "submitted") {
      void saveConversation(currentMessages);
      void autoTitle(currentMessages);
      const trimmed = capMessagesToolOutputs(currentMessages);
      if (trimmed !== currentMessages) setMessages(trimmed);
      return;
    }
    const timer = setTimeout(() => saveConversation(messagesRef.current), 250);
    return () => clearTimeout(timer);
  }, [status, messages.length, saveConversation, autoTitle, setMessages]);

  useEffect(() => {
    const handler = () => {
      const currentMessages = messagesRef.current;
      if (currentMessages.length === 0) return;
      const chatHistory = currentMessages.map((m) => ({
        role: m.role,
        content: m.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(""),
        id: m.id,
        parts: m.parts.map((p) => ({ ...p })),
      }));
      try {
        fetch("/api/conversations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: conversationId, messages: chatHistory }),
          keepalive: true,
        });
      } catch {
        // best-effort
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [conversationId]);

  const lastMessage = messages[messages.length - 1];

  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles).filter(
      (f) =>
        f.type.startsWith("image/") ||
        f.type === "application/pdf" ||
        f.type.startsWith("text/") ||
        f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
    listRef.current?.scrollToBottom();
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
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <StreamElapsedSlot key={streamTurn} active={isLoading}>
        {(streamingElapsed) => (
          <VirtualizedMessageList
            ref={listRef}
            messages={messages as UIMessage[]}
            isLoading={isLoading}
            innerClassName="p-4 max-w-3xl mx-auto"
            emptyState={
              <div className="text-center text-muted-foreground py-10">
                <p className="text-sm">
                  Hi! I&apos;m your travel concierge.
                </p>
                <p className="text-xs mt-1">
                  Ask me anything — upload a PDF, compare itineraries, or get a second opinion.
                </p>
              </div>
            }
            footer={
              <>
                {isLoading && lastMessage?.role === "user" ? (
                  <div className="flex justify-start animate-agent-part-in">
                    <div className="shimmer-border max-w-[85%] space-y-1.5 rounded-xl border border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
                          aria-hidden
                        />
                        Thinking…
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
              </>
            }
          />
        )}
      </StreamElapsedSlot>

      {dragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-8 py-6 text-center">
            <Paperclip className="size-6 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-primary">Drop files here</p>
            <p className="text-xs text-muted-foreground mt-1">
              Images, PDFs, DOCX, or text files
            </p>
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
        <div className="px-3 pt-2 flex flex-wrap gap-1.5 max-w-3xl mx-auto w-full">
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

      <form
        onSubmit={handleSubmit}
        className="shrink-0 p-3 border-t flex gap-2 items-end max-w-3xl mx-auto w-full"
      >
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
          placeholder="Ask me anything about travel..."
          disabled={isLoading}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 field-sizing-content max-h-40 overflow-y-auto"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={() => stop()}
            className="shrink-0 size-8 flex items-center justify-center rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors"
            title="Stop generating"
          >
            <Square className="size-3 fill-current" />
          </button>
        ) : (
          <Button
            type="submit"
            disabled={!inputValue.trim() && attachedFiles.length === 0}
            size="sm"
          >
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
