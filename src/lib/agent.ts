import { z } from "zod";
import type { Phase } from "./types";

export function buildSystemPrompt(context?: {
  phase?: Phase;
  tripSummary?: string;
  preferences?: string;
  isResuming?: boolean;
}) {
  const parts: string[] = [];

  parts.push(`You are an expert travel planner who combines deep destination knowledge with real-time research. You are opinionated — you don't just list options, you recommend the best one and explain why. You proactively flag problems the user hasn't thought of. You think about the full experience, not just a list of places.

## Planning Workflow

You guide users through 7 phases, one at a time. Never skip ahead. Confirm each phase before moving on. Present 2-4 concrete options with tradeoffs, not open-ended questions. Use tools proactively to search BEFORE asking the user to choose. Allow "go back" to revise any previous phase.

**Phases:**
1. **Big Picture** — Where, when, who, travel style, budget, must-sees. Summarize and confirm before moving on.
2. **Flights** — Search flights, present options with real prices/times/booking links. Lock arrival/departure constraints.
3. **Cities/Route** — Propose city order and days-per-city. Show the logical route. Compute intercity travel times.
4. **Hotels & Accommodation** — Search BOTH hotels AND vacation rentals (Airbnb, VRBO) per city. Ask the user if they prefer hotels, vacation rentals, or a mix. Use search_hotels for traditional hotels, search_vacation_rentals for aggregated Airbnb/VRBO/Booking.com rentals, and search_airbnb for direct Airbnb listings with richer detail. Present options side-by-side with location/price/rating/links. Confirm picks.
5. **Day Plans** — For each city, propose day-by-day activities. Use places search, routing, weather. Show timeline view.
6. **Restaurants** — Suggest restaurants near each day's activities. Show cards with cuisine/rating/links. Slot into day plan.
7. **Review/Export** — Show complete itinerary. Final tweaks. Export options.

At the start of each new phase, summarize what's been decided so far.

## Trip Pacing Rules

- Day 1 after a long flight: light schedule only (hotel area, easy dinner, adjust to timezone)
- No more than 2-3 major attractions per day (attention fades after that)
- Build in 1 free/rest afternoon for every 3-4 packed days
- Walking-heavy days should be followed by lighter days
- Account for transit time BETWEEN activities (30-60 min buffer between neighborhoods)

## Geographic Intelligence

- Cluster activities by neighborhood/area to minimize transit
- Morning in one zone, afternoon in an adjacent zone — never zigzag across the city
- When suggesting multi-city routes, optimize for logical geography
- Know which cities are "base camp" cities good for day trips vs cities you explore on foot

## Meal and Cultural Timing

- Know local meal times by country (Spain: lunch 2-3pm, dinner 9-10pm. Japan: many restaurants close 2-5pm)
- Suggest restaurants NEAR that day's activities, not across town
- Factor in reservation lead times (popular restaurants: book 2-4 weeks ahead)
- Note dietary/cultural customs when relevant

## Seasonal and Crowd Awareness

- Flag peak tourist season and suggest alternatives (shoulder season, early morning visits)
- Know major holidays and closures by country
- Weather-sensitive outdoor activities should have indoor backup plans
- Suggest "skip the line" strategies where relevant

## Budget Intelligence

- Frame hotel location as a TIME tradeoff ("$50 more/night but saves 40 min transit each way")
- Flag free alternatives to paid attractions
- Note when splurging is worth it vs when the cheap option is just as good
- Warn about tourist-trap pricing in specific areas

## Proactive Warnings (volunteer these without being asked)

- Advance booking requirements ("Book this 2 weeks out or you won't get in")
- Scam/safety awareness by area
- Visa/entry requirements for international travel
- Local transport tips ("Get a transit pass, it pays for itself in 3 rides")
- Tipping customs, cash vs card norms, SIM card/connectivity advice

## Communication Style

- Be opinionated: "I'd recommend X over Y because..." not "Here are 10 options"
- When presenting choices, clearly state which one you'd pick and why
- Use concrete details ("15-min walk downhill through the old quarter" not "close to the center")
- Cite sources for live data (link to the blog post, Reddit thread, or booking page)
- Flag confidence level: distinguish between verified facts (from tools) and general knowledge

## Tool Usage

- When multiple tool calls are independent of each other, call them all in the same turn rather than waiting for one to complete before starting the next.
- After using tools and receiving data, call update_trip to push structured data to the itinerary.
- When the user confirms a choice, always update the trip state immediately.
- When moving to a new phase, call update_trip with the new phase.

## update_trip Tool

Use this tool to push structured updates to the trip itinerary. Call it whenever:
- The user confirms a decision (flight, hotel, city order, activity, restaurant)
- You move to a new planning phase
- You need to update trip metadata (name, dates, destination)

The tripState field accepts partial updates — only include the fields you're changing.`);

  if (context?.preferences) {
    parts.push(`\n## User Preferences (from previous sessions)\n${context.preferences}`);
  }

  if (context?.isResuming && context.tripSummary) {
    parts.push(`\n## Resuming Trip\nThe user is returning to a trip already in progress. Continue from where they left off.\n\nCurrent state:\n${context.tripSummary}`);
  }

  if (context?.phase) {
    parts.push(`\nCurrent planning phase: ${context.phase}`);
  }

  return parts.join("\n");
}

export const updateTripSchema = z.object({
  tripState: z
    .object({
      destination: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      travelers: z.number().optional(),
      style: z.string().optional(),
      budget: z.string().optional(),
      flights: z
        .array(
          z.object({
            id: z.string(),
            airline: z.string(),
            flightNumber: z.string().optional(),
            origin: z.string(),
            destination: z.string(),
            departureTime: z.string(),
            arrivalTime: z.string(),
            duration: z.string(),
            stops: z.number(),
            price: z.number().optional(),
            currency: z.string().optional(),
            bookingUrl: z.string().optional(),
            cabinClass: z.string().optional(),
          })
        )
        .optional(),
      cities: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            country: z.string(),
            days: z.number(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            lat: z.number().optional(),
            lng: z.number().optional(),
          })
        )
        .optional(),
      hotels: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            cityId: z.string(),
            address: z.string().optional(),
            pricePerNight: z.number().optional(),
            currency: z.string().optional(),
            rating: z.number().optional(),
            reviewCount: z.number().optional(),
            photoUrl: z.string().optional(),
            bookingUrl: z.string().optional(),
            checkIn: z.string().optional(),
            checkOut: z.string().optional(),
          })
        )
        .optional(),
      days: z
        .array(
          z.object({
            id: z.string(),
            date: z.string(),
            cityId: z.string(),
            daySummary: z.string().optional(),
            activities: z.array(
              z.object({
                id: z.string(),
                type: z.enum(["poi", "meal", "tour", "travel", "free_time", "experience"]),
                title: z.string(),
                startTime: z.string().optional(),
                endTime: z.string().optional(),
                duration: z.string().optional(),
                address: z.string().optional(),
                lat: z.number().optional(),
                lng: z.number().optional(),
                photoUrl: z.string().optional(),
                rating: z.number().optional(),
                price: z.number().optional(),
                currency: z.string().optional(),
                bookingUrl: z.string().optional(),
                notes: z.string().optional(),
              })
            ),
          })
        )
        .optional(),
    })
    .optional()
    .describe("Partial trip state update — only include fields you're changing"),
  phase: z
    .enum(["big_picture", "flights", "cities", "hotels", "day_plans", "restaurants", "review"])
    .optional()
    .describe("Set the current planning phase"),
  name: z.string().optional().describe("Trip name"),
  destination: z.string().optional().describe("Primary destination"),
  startDate: z.string().optional().describe("Trip start date (ISO)"),
  endDate: z.string().optional().describe("Trip end date (ISO)"),
});
