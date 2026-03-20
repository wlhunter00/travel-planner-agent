"use client";

import { memo, useMemo, useState } from "react";
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";
import { Check, ChevronDown, ChevronRight, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToolMeta } from "@/lib/tool-meta";

export type ToolCallPartProps = {
  part: ToolUIPart | DynamicToolUIPart;
  /** Tighter layout when adjacent to another tool call */
  stackWithPrevious?: boolean;
  stackWithNext?: boolean;
};

function safeStringify(value: unknown, max = 4000): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= max) return s;
    return `${s.slice(0, max)}\n… (${s.length - max} more characters)`;
  } catch {
    return String(value);
  }
}

function isInFlightState(state: string): boolean {
  return (
    state === "input-streaming" ||
    state === "input-available" ||
    state === "approval-requested" ||
    state === "approval-responded"
  );
}

export const ToolCallPart = memo(function ToolCallPart({
  part,
  stackWithPrevious = false,
  stackWithNext = false,
}: ToolCallPartProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const toolName = getToolName(part);
  const meta = useMemo(() => getToolMeta(toolName), [toolName]);
  const { Icon, actionLabel, summarizeInput, summarizeOutput } = meta;

  const state = "state" in part ? part.state : "input-streaming";
  const input = "input" in part ? part.input : undefined;
  const output = "output" in part && part.state === "output-available" ? part.output : undefined;
  const errorText = "errorText" in part && typeof part.errorText === "string" ? part.errorText : null;

  const inFlight = isInFlightState(state);
  const subtitle = inFlight ? summarizeInput(input) : errorText ? errorText : summarizeOutput(output);

  const rounded =
    stackWithPrevious && stackWithNext
      ? "rounded-md"
      : stackWithPrevious
        ? "rounded-b-xl rounded-t-md"
        : stackWithNext
          ? "rounded-t-xl rounded-b-md"
          : "rounded-xl";

  return (
    <div
      className={`agent-tool-call animate-agent-part-in max-w-[85%] w-full border border-border/50 bg-muted/50 px-3 py-2 text-xs transition-all duration-300 ${rounded} ${
        inFlight ? "agent-tool-call-inflight shimmer-border" : "agent-tool-call-done"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 text-muted-foreground">
          {inFlight ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
          ) : errorText ? (
            <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5 text-primary/90" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5 font-medium text-foreground/95">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>{actionLabel}</span>
            <span className="font-mono text-[0.65rem] font-normal text-muted-foreground">
              {toolName}
            </span>
          </div>
          {subtitle ? (
            <p className="wrap-break-word text-muted-foreground leading-relaxed">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {!inFlight && (input !== undefined || output !== undefined || errorText) ? (
        <div className="mt-2 border-t border-border/40 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-[0.65rem] text-muted-foreground hover:text-foreground"
            onClick={() => setDetailsOpen((o) => !o)}
          >
            {detailsOpen ? (
              <ChevronDown className="mr-1 h-3 w-3" aria-hidden />
            ) : (
              <ChevronRight className="mr-1 h-3 w-3" aria-hidden />
            )}
            Details
          </Button>
          {detailsOpen ? (
            <div className="mt-2 max-h-64 space-y-2 overflow-auto rounded-md bg-black/20 p-2 font-mono text-[0.65rem] leading-snug text-muted-foreground">
              {input !== undefined ? (
                <div>
                  <div className="mb-1 text-[0.6rem] uppercase tracking-wide text-muted-foreground/80">
                    Input
                  </div>
                  <pre className="whitespace-pre-wrap break-all">{safeStringify(input)}</pre>
                </div>
              ) : null}
              {errorText ? (
                <div>
                  <div className="mb-1 text-[0.6rem] uppercase tracking-wide text-destructive/80">
                    Error
                  </div>
                  <pre className="whitespace-pre-wrap text-destructive/90">{errorText}</pre>
                </div>
              ) : null}
              {output !== undefined ? (
                <div>
                  <div className="mb-1 text-[0.6rem] uppercase tracking-wide text-muted-foreground/80">
                    Output
                  </div>
                  <pre className="whitespace-pre-wrap break-all">{safeStringify(output)}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
