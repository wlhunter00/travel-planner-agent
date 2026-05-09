import { z } from "zod";
import type { Tool } from "ai";
import { searchFlights, searchMultiCityFlights } from "@/lib/tools/kiwi";
import { searchHotels } from "@/lib/tools/serpapi-hotels";
import { searchVacationRentals } from "@/lib/tools/vacation-rentals";
import { searchAirbnb } from "@/lib/tools/airbnb";
import { searchPlaces, getPlaceDetails } from "@/lib/tools/google-places";
import { computeRoutesBatch, type RouteLegInput } from "@/lib/tools/google-maps";
import { webSearch, fetchUrlContent } from "@/lib/tools/exa";
import { searchTours } from "@/lib/tools/exa-tours";
import { deepResearch } from "@/lib/tools/research";
import { buildBookingUrl } from "@/lib/tools/booking-url";
import { updatePreferencesTool } from "@/lib/tools/preferences";

/**
 * Build the research-only tools shared by both the trip planner and the
 * concierge chat. These tools never mutate trip state.
 */
export function buildResearchTools({
  userId,
}: {
  userId: string;
}): Record<string, Tool> {
  return {
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
        "Search for traditional hotels (not vacation rentals) with real pricing from multiple booking sites. When the user wants a multi-day itinerary and you have check-in/check-out dates plus a base city, use this for a light anchor search (first stop) even if they have not said the word \u201chotel\u201d yet \u2014 unless they asked for flights-only. When the user\u2019s nightly budget is known, pass minPrice/maxPrice (USD) to filter out irrelevant price tiers (e.g. campgrounds, extreme budget). Do not also call search_vacation_rentals in the same turn unless you are in the dedicated Hotels & Accommodation phase. For Airbnb/VRBO as the anchor instead, use search_vacation_rentals or search_airbnb in that turn \u2014 not both lodging aggregators together outside the hotels phase.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Hotel search query \u2014 prefer a specific neighborhood or area (e.g. 'boutique hotels in Monti Rome') rather than generic 'hotels in Rome' for better relevance"
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
        "Build a working Booking.com search URL for a specific hotel. Use this whenever you recommend a hotel found via web_search or deep_research \u2014 never pass through raw booking.com links from search results (they contain expired session parameters). The structured lodging tools (search_hotels, search_vacation_rentals) already return working booking links, so this is only needed for the web-search fallback path.",
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
        query: z.string().describe("Search query \u2014 ALWAYS include the country or region to disambiguate (e.g. 'restaurants in Milos, Greece' not 'restaurants in Milos')"),
        location: z.string().optional().describe("Location bias (city name or lat,lng) \u2014 ALWAYS provide this for destination-specific searches to avoid cross-continent false matches"),
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
        "Compute travel time and distance for one or more origin\u2013destination pairs in a single call. Always prefer this over separate calls. Use for hotel-to-attraction distances, restaurant walks from the day\u2019s anchor, or recalculating the full matrix when the hotel/base changes (pass the new origin with the same destinations). Modes: driving, walking, transit, bicycling. Default mode per leg is walking when omitted.",
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
        "Search the web for real-time information \u2014 local guides, reviews, blog posts, Reddit threads, recent openings/closures.",
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

    fetch_url: {
      description:
        "Fetch and extract the main content from a specific URL. Use when the user shares a link and you need to understand what it contains (restaurant page, blog post, hotel listing, etc.).",
      inputSchema: z.object({
        url: z.string().describe("The URL to fetch"),
      }),
      execute: async ({ url }: { url: string }) => fetchUrlContent(url),
    },
  };
}
