"use client";

import { memo, useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ReasoningPartProps = {
  text: string;
  /** When true, this reasoning block is the latest part in a streaming assistant message */
  isLiveTail?: boolean;
};

export const ReasoningPart = memo(function ReasoningPart({ text, isLiveTail = false }: ReasoningPartProps) {
  const [userForcedClosed, setUserForcedClosed] = useState(false);
  const [userOpened, setUserOpened] = useState(false);

  const autoExpanded = isLiveTail && Boolean(text);
  const isOpen = (autoExpanded && !userForcedClosed) || userOpened;

  function toggle() {
    if (isOpen) {
      if (autoExpanded) setUserForcedClosed(true);
      setUserOpened(false);
    } else {
      setUserForcedClosed(false);
      setUserOpened(true);
    }
  }

  const len = text?.length ?? 0;
  const hasContent = len > 0;

  return (
    <div className="agent-reasoning max-w-[85%] w-full rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-xs animate-agent-part-in">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto w-full justify-start gap-2 px-1 py-1 text-left font-normal hover:bg-transparent"
        onClick={toggle}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Brain className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
        <span className="font-medium text-foreground/90">Thinking</span>
        {hasContent ? (
          <span className="text-[0.65rem] text-muted-foreground">· {len.toLocaleString()} chars</span>
        ) : (
          <span className="text-[0.65rem] text-muted-foreground">· …</span>
        )}
      </Button>

      {isOpen && hasContent ? (
        <div className="mt-2 max-h-56 overflow-auto border-l-2 border-primary/25 pl-3 font-mono text-[0.65rem] leading-relaxed text-muted-foreground">
          <p className="whitespace-pre-wrap wrap-break-word">{text}</p>
        </div>
      ) : null}

      {isOpen && !hasContent ? (
        <p className="mt-2 pl-7 text-[0.65rem] italic text-muted-foreground">
          No summary visible (model may encrypt or omit chain-of-thought).
        </p>
      ) : null}
    </div>
  );
});
