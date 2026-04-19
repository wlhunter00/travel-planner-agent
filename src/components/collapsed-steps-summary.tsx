"use client";

import { memo, useMemo, useState } from "react";
import type { UIMessage } from "ai";
import { isReasoningUIPart, isToolUIPart, getToolName } from "ai";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToolMeta } from "@/lib/tool-meta";
import { ReasoningPart } from "@/components/reasoning-part";
import { ToolCallPart } from "@/components/tool-call-part";

type Part = UIMessage["parts"][number];

const GERUND_TO_PAST: [RegExp, string][] = [
  [/^Searching\b/, "Searched"],
  [/^Computing\b/, "Computed"],
  [/^Updating\b/, "Updated"],
  [/^Saving\b/, "Saved"],
  [/^Finding\b/, "Found"],
  [/^Pushing\b/, "Pushed"],
  [/^Running\b/, "Ran"],
];

function toPastTense(label: string): string {
  for (const [pattern, replacement] of GERUND_TO_PAST) {
    if (pattern.test(label)) return label.replace(pattern, replacement);
  }
  return label;
}

function buildSummaryLabel(parts: Part[]): string {
  const toolCounts = new Map<string, number>();
  let hasReasoning = false;

  for (const part of parts) {
    if (isReasoningUIPart(part)) {
      hasReasoning = true;
    } else if (isToolUIPart(part)) {
      const label = toPastTense(getToolMeta(getToolName(part)).actionLabel);
      toolCounts.set(label, (toolCounts.get(label) ?? 0) + 1);
    }
  }

  const segments: string[] = [];
  if (hasReasoning) segments.push("Thought");
  for (const [label, count] of toolCounts) {
    segments.push(count > 1 ? `${label} (${count})` : label);
  }

  return segments.join(", ") || "Processed";
}

function toolPartKey(part: unknown, index: number): string {
  if (
    typeof part === "object" &&
    part !== null &&
    "toolCallId" in part &&
    typeof (part as { toolCallId: unknown }).toolCallId === "string"
  ) {
    return (part as { toolCallId: string }).toolCallId;
  }
  return `tool-${index}`;
}

export type CollapsedStepsSummaryProps = {
  parts: Part[];
};

export const CollapsedStepsSummary = memo(function CollapsedStepsSummary({
  parts,
}: CollapsedStepsSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const summary = useMemo(() => buildSummaryLabel(parts), [parts]);

  if (parts.length === 0) return null;

  return (
    <div className="max-w-[85%] w-full rounded-xl border border-border/40 bg-muted/30 px-3 py-2 text-xs animate-agent-part-in">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto w-full justify-start gap-2 px-1 py-1 text-left font-normal hover:bg-transparent"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Layers className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
        <span className="min-w-0 truncate font-medium text-foreground/90">{summary}</span>
      </Button>

      {isOpen && (
        <div className="mt-2 flex flex-col gap-2 border-l-2 border-primary/25 pl-3">
          {parts.map((part, i) => {
            if (isReasoningUIPart(part)) {
              return (
                <ReasoningPart
                  key={`reasoning-${i}`}
                  text={part.text ?? ""}
                  isLiveTail={false}
                />
              );
            }

            if (part.type === "step-start") {
              return (
                <div
                  key={`step-${i}`}
                  className="agent-step-start flex w-full items-center gap-2 py-0.5 text-[0.65rem] text-muted-foreground/75"
                >
                  <div className="h-px min-w-4 flex-1 bg-border/70" />
                  <span className="shrink-0 tabular-nums">Step</span>
                  <div className="h-px min-w-4 flex-1 bg-border/70" />
                </div>
              );
            }

            if (isToolUIPart(part)) {
              const prev = i > 0 ? parts[i - 1] : undefined;
              const next = i < parts.length - 1 ? parts[i + 1] : undefined;
              return (
                <ToolCallPart
                  key={toolPartKey(part, i)}
                  part={part}
                  stackWithPrevious={!!prev && isToolUIPart(prev)}
                  stackWithNext={!!next && isToolUIPart(next)}
                />
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
});
