import type { TripState } from "@/lib/types";

/**
 * Wanderlog browser automation sub-agent.
 *
 * This module is the entry point for pushing a finalized trip to Wanderlog
 * via Playwright browser automation. It operates as a separate agent with
 * its own context window, receiving only the TripState and navigation
 * instructions — no travel planning tools or conversation history.
 *
 * Prerequisites:
 * - User must be logged into Wanderlog in their browser
 * - Playwright MCP server must be running locally
 *
 * The automation flow:
 * 1. Navigate to wanderlog.com
 * 2. Create a new trip with the destination and dates
 * 3. For each city stop, add a section
 * 4. For each day, add activities/places to the itinerary
 * 5. Add hotels and restaurants
 * 6. Return success/failure status
 */

export interface WanderlogPushResult {
  success: boolean;
  tripUrl?: string;
  error?: string;
  placesAdded: number;
  placesSkipped: number;
}

export async function pushToWanderlog(tripState: TripState): Promise<WanderlogPushResult> {
  // Phase 2: This will be implemented using Playwright MCP tools
  // The implementation requires:
  // 1. A running Playwright MCP server (npx @playwright/mcp@latest)
  // 2. Browser context with Wanderlog session cookies
  // 3. Step-by-step navigation through the Wanderlog UI

  console.log("[Wanderlog] Push requested for trip:", tripState.destination);
  console.log("[Wanderlog] Cities:", tripState.cities.map((c) => c.name).join(", "));
  console.log("[Wanderlog] Days:", tripState.days.length);

  return {
    success: false,
    error:
      "Wanderlog browser automation is not yet configured. " +
      "To enable: 1) Install Playwright MCP server (npx @playwright/mcp@latest), " +
      "2) Log into Wanderlog in your browser, " +
      "3) Set WANDERLOG_ENABLED=true in .env.local",
    placesAdded: 0,
    placesSkipped: 0,
  };
}

/**
 * System prompt for the Wanderlog browser sub-agent.
 * Used when delegating to a separate agent instance for browser automation.
 */
export const WANDERLOG_AGENT_PROMPT = `You are a browser automation agent that pushes travel itineraries into Wanderlog.

You have access to Playwright browser tools. Your only job is to navigate the Wanderlog website and add trip data.

## Instructions

1. Navigate to https://wanderlog.com
2. If not logged in, inform the user they need to log in first
3. Click "Create a new trip"
4. Enter the trip name and dates
5. For each city in the itinerary:
   a. Add it as a destination
   b. For each day's activities in that city, search for the place and add it
6. Add hotels to the appropriate dates
7. Return the trip URL when done

## Rules

- Never modify or delete existing trips
- If a place can't be found on Wanderlog, skip it and report it as skipped
- Work efficiently — use Wanderlog's search to find places rather than entering addresses manually
- If you encounter an error, report it and continue with the next item`;
