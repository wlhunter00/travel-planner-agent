"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { UIMessage } from "ai";
import { isReasoningUIPart, isToolUIPart, isTextUIPart } from "ai";
import { ReasoningPart } from "@/components/reasoning-part";
import { ToolCallPart } from "@/components/tool-call-part";
import { CollapsedStepsSummary } from "@/components/collapsed-steps-summary";

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[0.9375rem] font-semibold mt-3 mb-1.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 last:mb-0 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-2 last:mb-0 ml-4 list-decimal space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block bg-black/5 dark:bg-white/5 rounded-md px-3 py-2 my-2 text-xs font-mono overflow-x-auto whitespace-pre">
          {children}
        </code>
      );
    }
    return (
      <code className="bg-black/5 dark:bg-white/5 rounded px-1 py-0.5 text-xs font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  hr: () => <hr className="my-3 border-border" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="max-w-full break-all text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/30 pl-3 my-2 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold bg-black/5 dark:bg-white/5">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

function extractUserText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("");
}

function toolPartReactKey(part: unknown, index: number): string {
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

function partIsRenderable(part: UIMessage["parts"][number]): boolean {
  if (isTextUIPart(part)) return Boolean(part.text?.trim());
  if (isReasoningUIPart(part)) return true;
  if (part.type === "step-start") return true;
  if (isToolUIPart(part)) return true;
  return false;
}

function isProcessPart(part: UIMessage["parts"][number]): boolean {
  return isReasoningUIPart(part) || part.type === "step-start" || isToolUIPart(part);
}

export interface ChatMessageProps {
  message: UIMessage;
  /** True while this assistant message is still receiving streamed parts */
  isStreamingAssistant?: boolean;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreamingAssistant = false,
}: ChatMessageProps) {
  if (message.role === "user") {
    const content = extractUserText(message);
    if (!content.trim()) return null;
    return (
      <div className="flex justify-end animate-agent-part-in">
        <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-primary text-primary-foreground">
          <span className="whitespace-pre-wrap">{content}</span>
        </div>
      </div>
    );
  }

  if (message.role !== "assistant") return null;

  const parts = message.parts;
  if (!parts.some(partIsRenderable)) return null;

  const processParts = parts.filter(isProcessPart);
  const hasProcessParts = processParts.length > 0;
  const shouldCollapse = !isStreamingAssistant && hasProcessParts;

  if (shouldCollapse) {
    return (
      <div className="flex w-full flex-col items-start gap-2">
        <CollapsedStepsSummary parts={processParts} />
        {parts.map((part, i) => {
          if (!isTextUIPart(part) || !part.text?.trim()) return null;
          return (
            <div key={`text-${i}`} className="flex w-full min-w-0 justify-start animate-agent-part-in">
              <div className="min-w-0 max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-muted">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {part.text}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-2">
      {parts.map((part, i) => {
        if (isTextUIPart(part)) {
          if (!part.text?.trim()) return null;
          return (
            <div key={`text-${i}`} className="flex w-full min-w-0 justify-start animate-agent-part-in">
              <div className="min-w-0 max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-muted">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {part.text}
                </ReactMarkdown>
              </div>
            </div>
          );
        }

        if (isReasoningUIPart(part)) {
          const isLiveTail = Boolean(isStreamingAssistant && i === parts.length - 1);
          return (
            <ReasoningPart
              key={`reasoning-${i}`}
              text={part.text ?? ""}
              isLiveTail={isLiveTail}
            />
          );
        }

        if (part.type === "step-start") {
          return (
            <div
              key={`step-${i}`}
              className="agent-step-start flex w-full max-w-[85%] items-center gap-2 py-0.5 text-[0.65rem] text-muted-foreground/75 animate-agent-part-in"
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
              key={toolPartReactKey(part, i)}
              part={part}
              stackWithPrevious={!!prev && isToolUIPart(prev)}
              stackWithNext={!!next && isToolUIPart(next)}
            />
          );
        }

        return null;
      })}
    </div>
  );
});
