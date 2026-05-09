import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { buildSystemPrompt } from "@/lib/agent";
import { getTrip } from "@/lib/trips-store";
import { getPreferences, type UserPreferences } from "@/lib/preferences-store";
import { requireAuth } from "@/lib/api-auth";
import { createPeekClient } from "@/lib/tools/peek";
import { saveTripSummaryTool } from "@/lib/tools/preferences";
import { pushToWanderlog } from "@/lib/tools/wanderlog/push-to-wanderlog";
import { buildResearchTools } from "@/lib/research-tools";
import { z } from "zod";
import type { Tool } from "ai";
import type { Recommendation, Phase, RecommendationCategory } from "@/lib/types";
import { sanitizeMessagesForStatelessRequest, topNLargestToolResults } from "@/lib/chat-context";
import { preprocessFilePartsInMessages } from "@/lib/chat-files";

export const maxDuration = 300;

const PHASE_CATEGORY_MAP: Record<Phase, RecommendationCategory[] | "all"> = {
  big_picture: "all",
  flights: [],
  cities: "all",
  hotels: ["hotel", "neighborhood"],
  day_plans: ["attraction", "activity", "shop", "neighborhood", "bar"],
  restaurants: ["restaurant", "bar"],
  review: "all",
};

const PRIORITY_LABELS = ["", "ignore", "low", "standard", "high", "top"] as const;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join("");
}

interface RecommenderHit {
  name: string;
  priority: number;
  notes?: string;
}

interface AggregatedItem {
  name: string;
  category: RecommendationCategory;
  location?: string;
  recommenders: RecommenderHit[];
  notes: string[];
}

/**
 * Group raw extracted items across all recommendations by normalized name +
 * category so the agent sees one row per real-world place, not one row per
 * recommender. Powers consensus-aware prompting and `get_recommendations`.
 */
function aggregateRecommendations(recs: Recommendation[]): AggregatedItem[] {
  const groups = new Map<string, AggregatedItem>();
  const readyRecs = recs.filter((r) => r.status === "ready" && r.extractedItems.length > 0);
  for (const r of readyRecs) {
    for (const item of r.extractedItems) {
      const key = `${item.category}|${normalizeName(item.name)}`;
      const recName = r.recommender ?? "(unattributed)";
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          name: item.name,
          category: item.category,
          location: item.location,
          recommenders: [{ name: recName, priority: 3, notes: item.notes }],
          notes: item.notes ? [item.notes] : [],
        });
        continue;
      }
      const dupRec = existing.recommenders.find((rh) => rh.name === recName);
      if (!dupRec) {
        existing.recommenders.push({ name: recName, priority: 3, notes: item.notes });
      }
      if (!existing.location && item.location) existing.location = item.location;
      if (item.notes && !existing.notes.includes(item.notes)) existing.notes.push(item.notes);
    }
  }
  return Array.from(groups.values());
}

function applyPriorities(
  groups: AggregatedItem[],
  priorities: Record<string, number> = {},
): AggregatedItem[] {
  for (const g of groups) {
    for (const rh of g.recommenders) {
      rh.priority = priorities[rh.name] ?? 3;
    }
  }
  return groups;
}

function formatRecommendations(
  recs: Recommendation[],
  phase?: Phase,
  priorities?: Record<string, number>,
): string {
  const groups = applyPriorities(aggregateRecommendations(recs), priorities);
  if (groups.length === 0) return "";

  const mapping = phase ? PHASE_CATEGORY_MAP[phase] : "all";
  const relevantCategories: RecommendationCategory[] =
    mapping === "all"
      ? ["restaurant", "bar", "hotel", "attraction", "activity", "shop", "neighborhood", "general"]
      : (mapping as RecommendationCategory[]);

  const relevant = relevantCategories.length > 0
    ? groups.filter((g) => relevantCategories.includes(g.category))
    : [];
  const other = groups.filter((g) => !relevantCategories.includes(g.category));

  const lines: string[] = [];

  if (relevant.length > 0) {
    const byCategory = new Map<string, AggregatedItem[]>();
    for (const g of relevant) {
      const list = byCategory.get(g.category) || [];
      list.push(g);
      byCategory.set(g.category, list);
    }
    const activeCount = (g: AggregatedItem) =>
      g.recommenders.filter((r) => r.priority > 1).length;
    const maxPriority = (g: AggregatedItem) =>
      g.recommenders.reduce((m, r) => Math.max(m, r.priority), 0);
    for (const [cat, items] of byCategory) {
      const sorted = [...items].sort((a, b) => {
        const ac = activeCount(a);
        const bc = activeCount(b);
        if (bc !== ac) return bc - ac;
        return maxPriority(b) - maxPriority(a);
      });
      lines.push(`${cat.charAt(0).toUpperCase() + cat.slice(1)}s:`);
      for (const g of sorted) {
        let line = `- ${g.name}`;
        if (g.location) line += ` (${g.location})`;
        const votes = activeCount(g);
        if (votes >= 2) {
          const tag = votes >= 3 ? "STRONG CONSENSUS" : "CONSENSUS";
          line += ` -- ${tag} (${votes} friends)`;
        }
        const recList = g.recommenders
          .map((r) => `${r.name} (${PRIORITY_LABELS[r.priority]})`)
          .join(", ");
        line += votes >= 2 ? ` [${recList}]` : ` -- from ${recList}`;
        if (g.notes.length > 0) line += `: "${g.notes.join(" | ")}"`;
        lines.push(line);
      }
    }
  }

  if (other.length > 0) {
    const counts = new Map<string, number>();
    for (const g of other) counts.set(g.category, (counts.get(g.category) || 0) + 1);
    const parts: string[] = [];
    for (const [cat, count] of counts) {
      parts.push(`${count} ${cat} recommendation${count > 1 ? "s" : ""}`);
    }
    lines.push(`\nOther recommendations available (use get_recommendations to view): ${parts.join(", ")}`);
  }

  return lines.join("\n");
}

function capRecommendationsText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const lines = text.split("\n");
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > maxChars) break;
    kept.push(line);
    used += line.length + 1;
  }
  const dropped = lines.length - kept.length;
  kept.push(
    `\n\u2026${dropped} more recommendation line${dropped === 1 ? "" : "s"} available \u2014 call \`get_recommendations\` to view the rest.`,
  );
  return kept.join("\n");
}

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const { messages: rawMessages, tripId } = await req.json();
  const messages = sanitizeMessagesForStatelessRequest(rawMessages);

  const trip = tripId ? await getTrip(tripId, userId) : null;
  const preferences = await getPreferences(userId);

  const recsTextRaw = trip?.recommendations?.length
    ? formatRecommendations(trip.recommendations, trip.phase as Phase | undefined, trip.recommenderPriorities)
    : undefined;
  const recsText = recsTextRaw ? capRecommendationsText(recsTextRaw, 20_000) : undefined;

  const isImported = !!(trip?.state as Record<string, unknown> | undefined)?.import;

  const systemPrompt = buildSystemPrompt({
    phase: trip?.phase,
    tripSummary: trip ? summarizeTrip(trip) : undefined,
    preferences: preferences ? formatPreferences(preferences) : undefined,
    recommendations: recsText || undefined,
    isResuming: trip?.chatHistory && trip.chatHistory.length > 0,
    todayUtc: new Date().toISOString().slice(0, 10),
    imported: isImported,
  });

  const peek = await createPeekClient();
  const researchTools = buildResearchTools({ userId });

  const tripSpecificTools: Record<string, Tool> = {
    update_trip: {
      description:
        "Update the trip itinerary, phase, or metadata. Call this when the user confirms a decision or you move to a new phase. Pass tripState as a JSON string of partial TripState to merge. When the user gives trip length, anchor dates, or a focal day (e.g. birthday, holiday, 'this weekend'), set startDate and endDate here as your best inferred YYYY-MM-DD window \u2014 refine later if needed. When the user states their home airport/city and you run transatlantic or open-jaw flight searches for a multi-country trip, set phase to flights for that work.",
      inputSchema: z.object({
        tripState: z.string().optional().describe("JSON string of partial TripState to merge"),
        phase: z.enum(["big_picture", "flights", "cities", "hotels", "day_plans", "restaurants", "review"]).optional(),
        name: z.string().optional(),
        destination: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
      execute: async (args: Record<string, unknown>) => {
        return { success: true, ...args };
      },
    },

    save_trip_summary: {
      description:
        "Save a summary of the completed trip to the user's preference history. Call this at the end of Phase 7 when the trip is finalized.",
      inputSchema: z.object({
        destination: z.string(),
        dates: z.string(),
        loved: z.array(z.string()).describe("Things the user loved about this trip"),
        wouldSkip: z.array(z.string()).describe("Things the user would skip next time"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => saveTripSummaryTool(userId, args),
    },

    push_to_wanderlog: {
      description:
        "Push the finalized trip itinerary to Wanderlog via browser automation. Only call this when the user explicitly asks to push to Wanderlog and the trip is in the review phase.",
      inputSchema: z.object({
        confirm: z.boolean().describe("Must be true to proceed"),
      }),
      execute: async () => {
        if (!trip) return { success: false, error: "No trip loaded" };
        return pushToWanderlog(trip.state);
      },
    },

    get_recommendations: {
      description:
        "Look up friend/personal recommendations by category. Use when you want to check what was recommended for a category not shown in your current context, or to get full details on all recommendations.",
      inputSchema: z.object({
        category: z
          .enum(["restaurant", "bar", "hotel", "attraction", "activity", "shop", "neighborhood", "all"])
          .optional()
          .default("all")
          .describe("Filter by category, or 'all' for everything"),
      }),
      execute: async ({ category }: { category?: string }) => {
        const recs = trip?.recommendations || [];
        const prio = trip?.recommenderPriorities ?? {};
        const groups = applyPriorities(aggregateRecommendations(recs), prio);
        if (groups.length === 0)
          return { items: [], message: "No recommendations have been added yet." };
        const filtered =
          !category || category === "all"
            ? groups
            : groups.filter((g) => g.category === category);
        const items = filtered
          .map((g) => {
            const activeVotes = g.recommenders.filter((r) => r.priority > 1).length;
            const maxPriority = g.recommenders.reduce((m, r) => Math.max(m, r.priority), 0);
            return {
              name: g.name,
              category: g.category,
              location: g.location,
              notes: g.notes.length > 0 ? g.notes.join(" | ") : undefined,
              recommenders: g.recommenders.map((r) => ({
                name: r.name,
                priority: PRIORITY_LABELS[r.priority],
              })),
              consensus:
                activeVotes >= 3
                  ? "STRONG CONSENSUS"
                  : activeVotes === 2
                    ? "CONSENSUS"
                    : undefined,
              activeVotes,
              _maxPriority: maxPriority,
            };
          })
          .sort((a, b) => {
            if (b.activeVotes !== a.activeVotes) return b.activeVotes - a.activeVotes;
            return b._maxPriority - a._maxPriority;
          })
          .map(({ _maxPriority: _omit, ...rest }) => rest);
        return { count: items.length, items };
      },
    },
  };

  const allTools = { ...researchTools, ...tripSpecificTools, ...peek.tools };

  const preprocessed = await preprocessFilePartsInMessages(messages);
  const modelMessages = await convertToModelMessages(preprocessed);

  const maxSteps = Number(process.env.CHAT_MAX_STEPS) || 50;
  const startedAt = Date.now();
  const messagesJsonChars = JSON.stringify(modelMessages).length;
  const systemPromptChars = systemPrompt.length;

  const top3LargestToolResults = topNLargestToolResults(messages, 3);

  console.log("[chat-telemetry] request", {
    tripId: tripId ?? null,
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
      console.log("[chat-telemetry] step", {
        step: stepIndex,
        finishReason,
        toolCallCount: toolCalls?.length ?? 0,
      });
    },
    onFinish: async ({ finishReason, usage }) => {
      console.log("[chat-telemetry] finish", {
        totalSteps: stepIndex,
        finishReason,
        durationMs: Date.now() - startedAt,
        usage,
      });
      await peek.close();
    },
    onError: async ({ error: streamError }) => {
      console.error("[chat-telemetry] error", {
        durationMs: Date.now() - startedAt,
        error: streamError instanceof Error ? streamError.message : String(streamError),
      });
      await peek.close();
    },
  });

  return result.toUIMessageStreamResponse();
}

interface SummarizableTrip {
  state: {
    destination: string;
    startDate: string;
    endDate: string;
    travelers: number;
    style: string;
    budget: string;
    flights: { airline: string; origin: string; destination: string; departureTime: string; price?: number }[];
    cities: { name: string; country: string; days: number; startDate?: string; endDate?: string }[];
    hotels: { name: string; cityId: string; pricePerNight?: number; checkIn?: string; checkOut?: string }[];
    days: { date: string; cityId: string; daySummary?: string; activities: { title: string; type: string }[] }[];
    import?: {
      sourceFilename?: string;
      optionLabel?: string;
      statedDriveTimes?: string[];
      alternatives?: { hotels: { name: string; baseLabel: string; rating?: string; priceHint?: string }[] };
    };
  };
  phase: string;
}

function summarizeTrip(trip: SummarizableTrip): string {
  const s = trip.state;
  const parts: string[] = [];

  if (s.destination) parts.push(`Destination: ${s.destination}`);
  if (s.startDate && s.endDate) parts.push(`Dates: ${s.startDate} to ${s.endDate}`);
  if (s.travelers) parts.push(`Travelers: ${s.travelers}`);
  if (s.style) parts.push(`Style: ${s.style}`);
  if (s.budget) parts.push(`Budget: ${s.budget}`);

  if (s.flights.length) {
    parts.push("Flights:");
    for (const f of s.flights) {
      const price = f.price ? ` $${f.price}` : "";
      parts.push(`  - ${f.airline} ${f.origin}\u2192${f.destination} ${f.departureTime.slice(0, 10)}${price}`);
    }
  }

  if (s.cities.length) {
    const cityStrs = s.cities.map((c) => {
      const dates = c.startDate && c.endDate ? ` (${c.startDate.slice(5)}\u2013${c.endDate.slice(5)})` : ` (${c.days}d)`;
      return `${c.name}${dates}`;
    });
    parts.push(`Cities: ${cityStrs.join(" \u2192 ")}`);
  }

  if (s.hotels.length) {
    parts.push("Hotels:");
    for (const h of s.hotels) {
      const price = h.pricePerNight ? ` $${h.pricePerNight}/night` : "";
      const dates = h.checkIn && h.checkOut ? ` ${h.checkIn.slice(5)}\u2013${h.checkOut.slice(5)}` : "";
      parts.push(`  - ${h.name}${price}${dates}`);
    }
  }

  if (s.days.length) {
    parts.push("Day plans:");
    for (const d of s.days) {
      const summary = d.daySummary
        || d.activities.map((a) => a.title).join(", ")
        || "No activities";
      const isFree = d.activities.length === 0
        || (d.activities.length === 1 && d.activities[0].type === "free_time");
      parts.push(`  - ${d.date.slice(5)}: ${isFree ? "FREE DAY" : summary}`);
    }
  }

  if (s.import) {
    if (s.import.sourceFilename) parts.push(`Imported from: ${s.import.sourceFilename}`);
    if (s.import.optionLabel) parts.push(`Option: ${s.import.optionLabel}`);
    if (s.import.statedDriveTimes?.length) {
      parts.push("Stated drive times (from source doc):");
      for (const dt of s.import.statedDriveTimes) {
        parts.push(`  - ${dt}`);
      }
    }
    if (s.import.alternatives?.hotels?.length) {
      parts.push("Hotel alternatives (from source doc \u2014 not selected as top pick):");
      for (const h of s.import.alternatives.hotels) {
        const extra = [h.rating, h.priceHint].filter(Boolean).join(" \u00b7 ");
        parts.push(`  - ${h.name} (base: ${h.baseLabel})${extra ? ` \u2014 ${extra}` : ""}`);
      }
    }
  }

  parts.push(`Current phase: ${trip.phase}`);
  return parts.join("\n");
}

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
