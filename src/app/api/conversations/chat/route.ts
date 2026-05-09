import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { buildConciergeSystemPrompt } from "@/lib/concierge-agent";
import { buildResearchTools } from "@/lib/research-tools";
import { listTrips } from "@/lib/trips-store";
import { getPreferences, type UserPreferences } from "@/lib/preferences-store";
import { requireAuth } from "@/lib/api-auth";
import { createPeekClient } from "@/lib/tools/peek";
import { sanitizeMessagesForStatelessRequest, topNLargestToolResults } from "@/lib/chat-context";
import { preprocessFilePartsInMessages } from "@/lib/chat-files";

export const maxDuration = 300;

function formatPreferences(prefs: Record<string, unknown> | UserPreferences): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(prefs)) {
    if (key === "lastUpdated") continue;
    if (Array.isArray(value) && value.length > 0) {
      lines.push(`- ${key}: ${value.join(", ")}`);
    } else if (typeof value === "string" && value) {
      lines.push(`- ${key}: ${value}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "No preferences saved yet.";
}

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const { messages: rawMessages } = await req.json();
  const messages = sanitizeMessagesForStatelessRequest(rawMessages);

  const [preferences, trips] = await Promise.all([
    getPreferences(userId),
    listTrips(userId),
  ]);

  const systemPrompt = buildConciergeSystemPrompt({
    preferences: preferences ? formatPreferences(preferences) : undefined,
    todayUtc: new Date().toISOString().slice(0, 10),
    trips,
  });

  const peek = await createPeekClient();
  const researchTools = buildResearchTools({ userId });
  const allTools = { ...researchTools, ...peek.tools };

  const preprocessed = await preprocessFilePartsInMessages(messages);
  const modelMessages = await convertToModelMessages(preprocessed);

  const maxSteps = Number(process.env.CHAT_MAX_STEPS) || 50;
  const startedAt = Date.now();
  const messagesJsonChars = JSON.stringify(modelMessages).length;
  const systemPromptChars = systemPrompt.length;

  const top3LargestToolResults = topNLargestToolResults(messages, 3);

  console.log("[concierge-telemetry] request", {
    userId,
    messageCount: modelMessages.length,
    systemPromptChars,
    messagesJsonChars,
    estTokens: Math.ceil((systemPromptChars + messagesJsonChars) / 4),
    top3LargestToolResults,
  });

  let stepIndex = 0;
  const result = streamText({
    model: openai("gpt-5.4"),
    system: systemPrompt,
    messages: modelMessages,
    tools: allTools,
    stopWhen: stepCountIs(maxSteps),
    providerOptions: {
      openai: {
        reasoningEffort: "high",
        reasoningSummary: "concise",
        store: false,
      },
    },
    onStepFinish: ({ finishReason, toolCalls }) => {
      stepIndex += 1;
      console.log("[concierge-telemetry] step", {
        step: stepIndex,
        finishReason,
        toolCallCount: toolCalls?.length ?? 0,
      });
    },
    onFinish: async ({ finishReason, usage }) => {
      console.log("[concierge-telemetry] finish", {
        totalSteps: stepIndex,
        finishReason,
        durationMs: Date.now() - startedAt,
        usage,
      });
      await peek.close();
    },
    onError: async ({ error: streamError }) => {
      console.error("[concierge-telemetry] error", {
        durationMs: Date.now() - startedAt,
        error: streamError instanceof Error ? streamError.message : String(streamError),
      });
      await peek.close();
    },
  });

  return result.toUIMessageStreamResponse();
}
