import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { buildSystemPrompt } from "@/lib/agent";
import { getTrip } from "@/lib/trips-store";
import { getPreferences, type UserPreferences } from "@/lib/preferences-store";
import { searchFlights, searchMultiCityFlights } from "@/lib/tools/kiwi";
import { searchHotels } from "@/lib/tools/serpapi-hotels";
import { searchVacationRentals } from "@/lib/tools/vacation-rentals";
import { searchAirbnb } from "@/lib/tools/airbnb";
import { searchPlaces, getPlaceDetails } from "@/lib/tools/google-places";
import { computeRoutesBatch, type RouteLegInput } from "@/lib/tools/google-maps";
import { webSearch } from "@/lib/tools/exa";
import { searchTours } from "@/lib/tools/exa-tours";
import { createPeekClient } from "@/lib/tools/peek";
import { deepResearch } from "@/lib/tools/research";
import { updatePreferencesTool, saveTripSummaryTool } from "@/lib/tools/preferences";
import { pushToWanderlog } from "@/lib/tools/wanderlog/push-to-wanderlog";
import { z } from "zod";
import type { Tool } from "ai";

export const maxDuration = 300;

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
        return next as (typeof m.parts)[number];
      });

    return { ...m, parts };
  });
}

export async function POST(req: Request) {
  const { messages: rawMessages, tripId } = await req.json();
  const messages = sanitizeMessagesForStatelessRequest(rawMessages);

  const trip = tripId ? await getTrip(tripId) : null;
  const preferences = await getPreferences();

  const systemPrompt = buildSystemPrompt({
    phase: trip?.phase,
    tripSummary: trip ? summarizeTrip(trip) : undefined,
    preferences: preferences ? formatPreferences(preferences) : undefined,
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
        query: z.string().describe("Search query"),
        location: z.string().optional().describe("Location bias (city name or lat,lng)"),
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
      execute: async (args: any) => updatePreferencesTool(args),
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
      execute: async (args: any) => saveTripSummaryTool(args),
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
  };

  const allTools = { ...tools, ...peek.tools };

  const modelMessages = await convertToModelMessages(messages);

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

function summarizeTrip(trip: {
  state: {
    destination: string;
    startDate: string;
    endDate: string;
    travelers: number;
    style: string;
    budget: string;
    flights: unknown[];
    cities: unknown[];
    hotels: unknown[];
    days: unknown[];
  };
  phase: string;
}): string {
  const s = trip.state;
  const parts: string[] = [];
  if (s.destination) parts.push(`Destination: ${s.destination}`);
  if (s.startDate && s.endDate) parts.push(`Dates: ${s.startDate} to ${s.endDate}`);
  if (s.travelers) parts.push(`Travelers: ${s.travelers}`);
  if (s.style) parts.push(`Style: ${s.style}`);
  if (s.budget) parts.push(`Budget: ${s.budget}`);
  if (s.flights.length) parts.push(`Flights: ${s.flights.length} booked`);
  if (s.cities.length)
    parts.push(
      `Cities: ${(s.cities as { name: string }[]).map((c) => c.name).join(" → ")}`
    );
  if (s.hotels.length) parts.push(`Hotels: ${s.hotels.length} booked`);
  if (s.days.length) parts.push(`Day plans: ${s.days.length} days planned`);
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
