import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs } from "ai";
import { buildSystemPrompt } from "@/lib/agent";
import { getTrip } from "@/lib/trips-store";
import { getPreferences, type UserPreferences } from "@/lib/preferences-store";
import { searchFlights } from "@/lib/tools/kiwi";
import { searchHotels } from "@/lib/tools/serpapi-hotels";
import { searchVacationRentals } from "@/lib/tools/vacation-rentals";
import { searchAirbnb } from "@/lib/tools/airbnb";
import { searchPlaces, getPlaceDetails } from "@/lib/tools/google-places";
import { computeTransitRoute } from "@/lib/tools/google-maps";
import { webSearch } from "@/lib/tools/exa";
import { searchTours } from "@/lib/tools/viator";
import { deepResearch } from "@/lib/tools/research";
import { updatePreferencesTool, saveTripSummaryTool } from "@/lib/tools/preferences";
import { pushToWanderlog } from "@/lib/tools/wanderlog/push-to-wanderlog";
import { z } from "zod";
import type { Tool } from "ai";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { messages, tripId } = await req.json();

  const trip = tripId ? await getTrip(tripId) : null;
  const preferences = await getPreferences();

  const systemPrompt = buildSystemPrompt({
    phase: trip?.phase,
    tripSummary: trip ? summarizeTrip(trip) : undefined,
    preferences: preferences ? formatPreferences(preferences) : undefined,
    isResuming: trip?.chatHistory && trip.chatHistory.length > 0,
  });

  const tools: Record<string, Tool> = {
    update_trip: {
      description:
        "Update the trip itinerary, phase, or metadata. Call this when the user confirms a decision or you move to a new phase. Pass tripState as a JSON string of partial TripState to merge.",
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
        "Search for flights between two locations. Returns real-time pricing, airlines, durations, stops, and booking links.",
      inputSchema: z.object({
        origin: z.string().describe("Origin airport code or city name"),
        destination: z.string().describe("Destination airport code or city name"),
        departureDate: z.string().describe("Departure date (YYYY-MM-DD)"),
        returnDate: z.string().optional().describe("Return date for round-trip (YYYY-MM-DD)"),
        adults: z.number().default(1).describe("Number of adult passengers"),
        cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => searchFlights(args),
    },

    search_hotels: {
      description:
        "Search for traditional hotels (not vacation rentals) with real pricing from multiple booking sites. For Airbnb/VRBO, use search_vacation_rentals or search_airbnb instead.",
      inputSchema: z.object({
        query: z.string().describe("Hotel search query (e.g., 'hotels in central Rome')"),
        checkIn: z.string().describe("Check-in date (YYYY-MM-DD)"),
        checkOut: z.string().describe("Check-out date (YYYY-MM-DD)"),
        adults: z.number().default(2),
        sortBy: z.enum(["relevance", "lowest_price", "highest_rating"]).default("relevance"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => searchHotels(args),
    },

    search_vacation_rentals: {
      description:
        "Search for vacation rentals (Airbnb, VRBO, Booking.com) aggregated from Google. Returns properties with prices, ratings, photos, bedroom/bathroom counts, and booking links. Use this alongside search_hotels to give users both hotel and rental options.",
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
        "Search Airbnb directly for listings with detailed info: exact nightly prices, superhost status, room type, amenities, and direct Airbnb booking links. Use this when the user specifically wants Airbnb or when you need richer rental details than search_vacation_rentals provides.",
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

    compute_route: {
      description:
        "Compute travel time and directions between two locations. Supports driving, walking, transit, and bicycling.",
      inputSchema: z.object({
        origin: z.string().describe("Origin address or place name"),
        destination: z.string().describe("Destination address or place name"),
        mode: z.enum(["driving", "walking", "transit", "bicycling"]).default("transit"),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (args: any) => computeTransitRoute(args),
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
        "Search for tours, activities, and experiences with pricing and booking links from Viator.",
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
        "Comprehensive multi-source research for discovery questions like 'what are the best day trips from X?' or 'hidden gems in Y'. Fires multiple searches in parallel across travel blogs, Reddit, Google Places, and Viator, then returns deduplicated, ranked results.",
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

  const result = streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(10),
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
