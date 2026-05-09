"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from "react";
import type { UIMessage } from "ai";
import { ChatMessage } from "@/components/chat-message";

export interface VirtualMessageListHandle {
  scrollToBottom: () => void;
}

interface VirtualizedMessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  emptyState?: ReactNode;
  footer?: ReactNode;
  innerClassName?: string;
}

export const VirtualizedMessageList = forwardRef<
  VirtualMessageListHandle,
  VirtualizedMessageListProps
>(function VirtualizedMessageList(
  { messages, isLoading, emptyState, footer, innerClassName },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastMessageId =
    messages.length > 0 ? messages[messages.length - 1].id : undefined;

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: () => {
        stickToBottomRef.current = true;
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
    }),
    [],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
      onScroll={handleScroll}
    >
      <div className={innerClassName}>
        {messages.length === 0 && emptyState}

        {messages.length > 0 && (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualItems.map((virtualRow) => {
              const message = messages[virtualRow.index];
              return (
                <div
                  key={message.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="pb-4">
                    <ChatMessage
                      message={message}
                      isStreamingAssistant={
                        isLoading &&
                        message.role === "assistant" &&
                        message.id === lastMessageId
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {footer}
      </div>
    </div>
  );
});
