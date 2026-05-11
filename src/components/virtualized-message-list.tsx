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
import { cn } from "@/lib/utils";

const STICKY_THRESHOLD_PX = 120;
const PROGRAMMATIC_SCROLL_MS = 250;
/** Matches previous `p-4` vertical inset; horizontal via `px-4` on inner wrapper. */
const LIST_PADDING = 16;

export interface VirtualMessageListHandle {
  scrollToBottom: () => void;
  isAtBottom: () => boolean;
}

interface VirtualizedMessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  emptyState?: ReactNode;
  footer?: ReactNode;
  innerClassName?: string;
  onStickyChange?: (atBottom: boolean) => void;
}

export const VirtualizedMessageList = forwardRef<
  VirtualMessageListHandle,
  VirtualizedMessageListProps
>(function VirtualizedMessageList(
  { messages, isLoading, emptyState, footer, innerClassName, onStickyChange },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(true);
  const programmaticUntilRef = useRef(0);

  const lastMessageId =
    messages.length > 0 ? messages[messages.length - 1].id : undefined;

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
    paddingStart: LIST_PADDING,
    paddingEnd: LIST_PADDING,
  });

  const updateSticky = useCallback(
    (next: boolean) => {
      if (stickyRef.current === next) return;
      stickyRef.current = next;
      onStickyChange?.(next);
    },
    [onStickyChange],
  );

  const scrollToBottomNow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    programmaticUntilRef.current = performance.now() + PROGRAMMATIC_SCROLL_MS;
    updateSticky(true);
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, {
        align: "end",
        behavior: "instant",
      });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, virtualizer, updateSticky]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: () => {
        scrollToBottomNow();
      },
      isAtBottom: () => stickyRef.current,
    }),
    [scrollToBottomNow],
  );

  const handleScroll = useCallback(() => {
    if (performance.now() < programmaticUntilRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD_PX;
    updateSticky(atBottom);
  }, [updateSticky]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(() => {
      if (stickyRef.current) {
        scrollToBottomNow();
      }
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [scrollToBottomNow]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
      onScroll={handleScroll}
    >
      <div ref={innerRef} className={cn("px-4", innerClassName)}>
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
