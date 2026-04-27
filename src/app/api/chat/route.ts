import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { buildSystemPrompt } from "@/lib/agent";
import { getTrip } from "@/lib/trips-store";
import { getPreferences, type UserPreferences } from "@/lib/preferences-store";
import { requireAuth } from "@/lib/api-auth";
import { searchFlights, searchMultiCityFlights } from "@/lib/tools/kiwi";
import { searchHotels } from "@/lib/tools/serpapi-hotels";
import { searchVacationRentals } from "@/lib/tools/vacation-rentals";
import { searchAirbnb } from "@/lib/tools/airbnb";
import { searchPlaces, getPlaceDetails } from "@/lib/tools/google-places";
import { computeRoutesBatch, type RouteLegInput } from "@/lib/tools/google-maps";
import { webSearch, fetchUrlContent } from "@/lib/tools/exa";
import { searchTours } from "@/lib/tools/exa-tours";
import { createPeekClient } from "@/lib/tools/peek";
import { deepResearch } from "@/lib/tools/research";
import { buildBookingUrl } from "@/lib/tools/booking-url";
import { updatePreferencesTool, saveTripSummaryTool } from "@/lib/tools/preferences";
import { pushToWanderlog } from "@/lib/tools/wanderlog/push-to-wanderlog";
import { z } from "zod";
import type { Tool } from "ai";
import type { Recommendation, Phase, RecommendationCategory } from "@/lib/types";

export const maxDuration = 300;

/**
 * Recursively replace photoUrl string values with "[photo]" to reduce token
 * bloat in historical tool results sent back to the model. The UI retains
 * the original URLs — this only affects the model's view on subsequent turns.
 */
function stripPhotoUrls(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripPhotoUrls);
  if (typeof obj === "object" && obj !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = k === "photoUrl" && typeof v === "string" ? "[photo]" : stripPhotoUrls(v);
    }
    return out;
  }
  return obj;
}

/**
 * Each chat POST is stateless. Assistant UI parts retain OpenAI Responses `itemId`s
 * from the prior stream; with default store:true the provider turns those into
 * `item_reference` instead of text, which is invalid on a new HTTP request.
 * Strip ephemeral provider ids and reasoning scaffolding so history round-trips as plain content.
 */
function sanitizeMessagesForStatelessRequest(raw: unknown[]): UIMessage[] {
  return (Array.isArray(raw) ? raw : []).map((msg) => {
    if (
      typeof msg !== "object" ||
      msg === null ||
      !("role" in msg) ||
      !("parts" in msg) ||
      !Array.isArray((msg as { parts: unknown }).parts)
    ) {
      return msg as UIMessage;
    }
    const m = msg as UIMessage;
    if (m.role !== "assistant") return m;

    const parts = m.parts
      .filter((p) => p.type !== "reasoning" && p.type !== "step-start")
      .map((part) => {
        const next = { ...part } as Record<string, unknown>;
        delete next.providerMetadata;
        delete next.callProviderMetadata;
        if (next.type === "tool-invocation" && next.result !== undefined) {
          next.result = stripPhotoUrls(next.result);
        }
        return next as (typeof m.parts)[number];
      });

    return { ...m, parts };
  });
}

async function extractPdfTextFromDataUrl(dataUrl: string): Promise<string> {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return "[Could not decode PDF]";
    const { PDFParse } = await import("pdf-parse");
    const data = Buffer.from(base64, "base64");
    const parser = new PDFParse({ data });
    const result = await parser.getText();
    return result.text;
  } catch {
    return "[Failed to extract PDF text]";
  }
}

async function preprocessFilePartsInMessages(msgs: UIMessage[]): Promise<UIMessage[]> {
  return Promise.all(
    msgs.map(async (msg) => {
      if (msg.role !== "user") return msg;
      const hasPdfParts = msg.parts.some(
        (p) => p.type === "file" && "mediaType" in p && (p as Record<string, unknown>).mediaType === "application/pdf"
      );
      if (!hasPdfParts) return msg;

      const newParts = await Promise.all(
        msg.parts.map(async (part) => {
          if (part.type !== "file") return part;
          const fp = part as Record<string, unknown>;
          if (fp.mediaType !== "application/pdf") return part;
          const text = await extractPdfTextFromDataUrl(fp.url as string);
          const filename = (fp.filename as string) || "document.pdf";
          return { type: "text" as const, text: `[Attached PDF: ${filename}]\n\n${text}` };
        })
      );
      return { ...msg, parts: newParts } as UIMessage;
    })
  );
}

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
    // Treat anyone the user has not muted (priority > 1 = not "ignore") as a real vote.
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

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const { messages: rawMessages, tripId } = await req.json();
  const messages = sanitizeMessagesForStatelessRequest(rawMessages);

  const trip = tripId ? await getTrip(tripId, userId) : null;
  const preferences = await getPreferences(userId);

  const recsText = trip?.recommendations?.length
    ? formatRecommendations(trip.recommendations, trip.phase as Phase | undefined, trip.recommenderPriorities)
    : undefined;

  const systemPrompt = buildSystemPrompt({
    phase: trip?.phase,
    tripSummary: trip ? summarizeTrip(trip) : undefined,
    preferences: preferences ? formatPreferences(preferences) : undefined,
    recommendations: recsText || undefined,
    isResuming: trip?.chatHistory && trip.chatHistory.length > 0,
    todayUtc: new Date().toISOString().slice(0, 10),
  });

  const peek = await createPeekClient();

  const tools: Record<string, Tool> = {
    update_trip: {
      description:
        "Update the trip itinerary, phase, or metadata. Call this when the user confirms a decision or you move to a new phase. Pass tripState as a JSON string of partial TripState to merge. When the user gives trip length, anchor dates, or a focal day (e.g. birthday, holiday, 'this weekend'), set startDate and endDate here as your best inferred YYYY-MM-DD window — refine later if needed. When the user states their home airport/city and you run transatlantic or open-jaw flight searches for a multi-country trip, set phase to flights for that work.",
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

    search_flights: {
      description:
        "Search round-trip or one-way flights between two airports. MUST use 3-letter IATA codes for origin and destination (e.g. JFK, LIS, OPO). City names like 'Lisbon' often fail — use LIS. Returns real-time pricing, airlines, durations, stops, and booking links. If the tool returns an error field, fix the airport codes and retry. Once the user names their home airport and you have trip dates, use this to price hub or round-trip options for multi-country international trips (unless they defer flights).",
      inputSchema: z.object({
        origin: z.string().describe("Origin IATA code (3 letters), e.g. JFK"),
        destination: z.string().describe("Destination IATA code (3 letters), e.g. LIS"),
        departureDate: z.string().describe("Departure date (YYYY-MM-DD)"),
        returnDate: z.string().optional().describe("Return date for round-trip (YYYY-MM-DD)"),
        adults: z.number().default(1).describe("Number of adult passengers"),
        cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => searchFlights(args),
    },

    search_multi_city_flights: {
      description:
        "Search multi-city / open-jaw itineraries (e.g. fly into Lisbon, home from Porto). Use when the user wants different arrival and departure cities or when validating route order for a multi-stop international trip. Pass each segment with IATA codes and date. totalPrice is the combined cost across ALL segments. Each result includes a segments array with airline, times, stops, and hasDetails per leg when available; if the provider omits a later leg, the tool backfills timing from a one-way search (still verify exact pairing via the bookingUrl).",
      inputSchema: z.object({
        legs: z
          .array(
            z.object({
              origin: z.string().describe("IATA code, e.g. JFK"),
              destination: z.string().describe("IATA code, e.g. LIS"),
              date: z.string().describe("YYYY-MM-DD for this segment"),
            })
          )
          .min(1)
          .describe("Ordered flight segments (e.g. [{JFK,LIS,outbound},{OPO,JFK,return}])"),
        adults: z.number().default(1),
        cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => searchMultiCityFlights(args),
    },

    search_hotels: {
      description:
        "Search for traditional hotels (not vacation rentals) with real pricing from multiple booking sites. When the user wants a multi-day itinerary and you have check-in/check-out dates plus a base city, use this for a light anchor search (first stop) even if they have not said the word “hotel” yet — unless they asked for flights-only. When the user's nightly budget is known, pass minPrice/maxPrice (USD) to filter out irrelevant price tiers (e.g. campgrounds, extreme budget). Do not also call search_vacation_rentals in the same turn unless you are in the dedicated Hotels & Accommodation phase. For Airbnb/VRBO as the anchor instead, use search_vacation_rentals or search_airbnb in that turn — not both lodging aggregators together outside the hotels phase.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Hotel search query — prefer a specific neighborhood or area (e.g. 'boutique hotels in Monti Rome') rather than generic 'hotels in Rome' for better relevance"
          ),
        checkIn: z.string().describe("Check-in date (YYYY-MM-DD)"),
        checkOut: z.string().describe("Check-out date (YYYY-MM-DD)"),
        adults: z.number().default(2),
        sortBy: z.enum(["relevance", "lowest_price", "highest_rating"]).default("relevance"),
        minPrice: z.number().optional().describe("Minimum nightly price in USD (use when budget is known to exclude hostels/campgrounds)"),
        maxPrice: z.number().optional().describe("Maximum nightly price in USD"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => searchHotels(args),
    },

    build_booking_url: {
      description:
        "Build a working Booking.com search URL for a specific hotel. Use this whenever you recommend a hotel found via web_search or deep_research — never pass through raw booking.com links from search results (they contain expired session parameters). The structured lodging tools (search_hotels, search_vacation_rentals) already return working booking links, so this is only needed for the web-search fallback path.",
      inputSchema: z.object({
        hotelName: z.string().describe("Exact hotel name"),
        city: z.string().describe("City and country (e.g. 'Rome, Italy')"),
        checkIn: z.string().describe("Check-in date (YYYY-MM-DD)"),
        checkOut: z.string().describe("Check-out date (YYYY-MM-DD)"),
        adults: z.number().optional().default(2),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => buildBookingUrl(args),
    },

    search_vacation_rentals: {
      description:
        "Search for vacation rentals (Airbnb, VRBO, Booking.com) aggregated from Google. Returns properties with prices, ratings, photos, bedroom/bathroom counts, and booking links. For concrete trip plans with dates + a first base, you may run this **instead of** search_hotels as the single anchor lodging search when the trip style skews rental-heavy; still ask hotel vs mix preferences afterward. Do not call both search_hotels and search_vacation_rentals in the same turn outside the dedicated Hotels & Accommodation phase.",
      inputSchema: z.object({
        query: z.string().describe("Search query (e.g., 'vacation rental in Trastevere Rome')"),
        checkIn: z.string().describe("Check-in date (YYYY-MM-DD)"),
        checkOut: z.string().describe("Check-out date (YYYY-MM-DD)"),
        adults: z.number().default(2),
        sortBy: z.enum(["relevance", "lowest_price", "highest_rating"]).default("relevance"),
        minPrice: z.number().optional().describe("Minimum nightly price in USD"),
        maxPrice: z.number().optional().describe("Maximum nightly price in USD"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => searchVacationRentals(args),
    },

    search_airbnb: {
      description:
        "Search Airbnb directly for listings with detailed info: exact nightly prices, superhost status, room type, amenities, and direct Airbnb booking links. Use when the user wants Airbnb or for a focused anchor search in one area; for a generic first lodging pass, search_hotels or search_vacation_rentals is often enough unless they skew rental-heavy.",
      inputSchema: z.object({
        location: z.string().describe("City or area to search (e.g., 'Rome, Italy')"),
        checkIn: z.string().describe("Check-in date (YYYY-MM-DD)"),
        checkOut: z.string().describe("Check-out date (YYYY-MM-DD)"),
        adults: z.number().default(2),
        minPrice: z.number().optional().describe("Minimum nightly price in USD"),
        maxPrice: z.number().optional().describe("Maximum nightly price in USD"),
        roomType: z.enum(["entire_home", "private_room", "shared_room"]).optional().describe("Filter by room type"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => searchAirbnb(args),
    },

    search_places: {
      description:
        "Search for places, restaurants, attractions, or points of interest using Google Places.",
      inputSchema: z.object({
        query: z.string().describe("Search query — ALWAYS include the country or region to disambiguate (e.g. 'restaurants in Milos, Greece' not 'restaurants in Milos')"),
        location: z.string().optional().describe("Location bias (city name or lat,lng) — ALWAYS provide this for destination-specific searches to avoid cross-continent false matches"),
        type: z.string().optional().describe("Place type filter (restaurant, tourist_attraction, etc.)"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => searchPlaces(args),
    },

    get_place_details: {
      description:
        "Get detailed information about a place including photos, reviews, ratings, and hours.",
      inputSchema: z.object({
        placeId: z.string().describe("Google Place ID"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => getPlaceDetails(args),
    },

    compute_routes: {
      description:
        "Compute travel time and distance for one or more origin–destination pairs in a single call. Always prefer this over separate calls. Use for hotel-to-attraction distances, restaurant walks from the day’s anchor, or recalculating the full matrix when the hotel/base changes (pass the new origin with the same destinations). Modes: driving, walking, transit, bicycling. Default mode per leg is walking when omitted.",
      inputSchema: z.object({
        routes: z
          .array(
            z.object({
              origin: z.string().describe("Origin address or place name"),
              destination: z.string().describe("Destination address or place name"),
              mode: z.enum(["driving", "walking", "transit", "bicycling"]).optional(),
            })
          )
          .min(1)
          .max(10)
          .describe("Up to 10 legs to compute in parallel"),
      }),
      execute: async (args: { routes: RouteLegInput[] }) => computeRoutesBatch({ routes: args.routes }),
    },

    web_search: {
      description:
        "Search the web for real-time information — local guides, reviews, blog posts, Reddit threads, recent openings/closures.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        numResults: z.number().default(5).describe("Number of results to return"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => webSearch(args),
    },

    search_tours: {
      description:
        "Search for tours and activities via web search across Viator, GetYourGuide, and TripAdvisor. Returns titles, descriptions, and booking links.",
      inputSchema: z.object({
        destination: z.string().describe("Destination city or region"),
        query: z.string().optional().describe("Specific activity query"),
        category: z.string().optional().describe("Category filter (day-trips, food-tours, etc.)"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => searchTours(args),
    },

    deep_research: {
      description:
        "Comprehensive multi-source research for discovery questions like 'what are the best day trips from X?' or 'hidden gems in Y'. Fires multiple searches in parallel across travel blogs, Reddit, Google Places, and tour booking sites, then returns deduplicated, ranked results.",
      inputSchema: z.object({
        query: z.string().describe("The discovery question"),
        destination: z.string().describe("The destination city/region"),
        style: z.string().optional().describe("Travel style for tailored results (foodie, outdoors, culture, etc.)"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => deepResearch(args),
    },

    update_preferences: {
      description:
        "Save or update user preferences learned from the conversation. Call this when the user expresses preferences (e.g., 'I'm vegetarian', 'I prefer boutique hotels'). Arrays are merged with existing values.",
      inputSchema: z.object({
        travelStyle: z.array(z.string()).optional(),
        accommodationStyle: z.array(z.string()).optional(),
        cuisinePreferences: z.array(z.string()).optional(),
        dietaryRestrictions: z.array(z.string()).optional(),
        activityInterests: z.array(z.string()).optional(),
        transportPreference: z.array(z.string()).optional(),
        avoids: z.array(z.string()).optional(),
        airlinePreferences: z.array(z.string()).optional(),
        budgetRange: z.string().optional(),
        splurgeCategories: z.array(z.string()).optional(),
        saveCategories: z.array(z.string()).optional(),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => updatePreferencesTool(userId, args),
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

    fetch_url: {
      description:
        "Fetch and extract the main content from a specific URL. Use when the user shares a link and you need to understand what it contains (restaurant page, blog post, hotel listing, etc.).",
      inputSchema: z.object({
        url: z.string().describe("The URL to fetch"),
      }),
      execute: async ({ url }: { url: string }) => fetchUrlContent(url),
    },
  };

  const allTools = { ...tools, ...peek.tools };

  const preprocessed = await preprocessFilePartsInMessages(messages);
  const modelMessages = await convertToModelMessages(preprocessed);

  const result = streamText({
    model: openai("gpt-5.4"),
    system: systemPrompt,
    messages: modelMessages,
    tools: allTools,
    stopWhen: stepCountIs(10),
    providerOptions: {
      openai: {
        reasoningEffort: "high",
        reasoningSummary: "concise",
        // Default store:true makes OpenAI persist response items and stream item references.
        // Zero Data Retention accounts cannot persist those items → mid-stream errors like
        // "Item with id 'rs_…' not found". Stateless chat + our message sanitization work with store:false.
        store: false,
      },
    },
    onFinish: async () => {
      await peek.close();
    },
    onError: async () => {
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
      parts.push(`  - ${f.airline} ${f.origin}→${f.destination} ${f.departureTime.slice(0, 10)}${price}`);
    }
  }

  if (s.cities.length) {
    const cityStrs = s.cities.map((c) => {
      const dates = c.startDate && c.endDate ? ` (${c.startDate.slice(5)}–${c.endDate.slice(5)})` : ` (${c.days}d)`;
      return `${c.name}${dates}`;
    });
    parts.push(`Cities: ${cityStrs.join(" → ")}`);
  }

  if (s.hotels.length) {
    parts.push("Hotels:");
    for (const h of s.hotels) {
      const price = h.pricePerNight ? ` $${h.pricePerNight}/night` : "";
      const dates = h.checkIn && h.checkOut ? ` ${h.checkIn.slice(5)}–${h.checkOut.slice(5)}` : "";
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
