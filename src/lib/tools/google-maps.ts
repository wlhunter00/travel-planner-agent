export type RouteMode = "driving" | "walking" | "transit" | "bicycling";

export interface RouteLegInput {
  origin: string;
  destination: string;
  mode?: RouteMode;
}

export interface RouteLegResult {
  origin: string;
  destination: string;
  mode: string;
  duration: string | null;
  distance: string | null;
}

const MODE_MAP: Record<string, string> = {
  driving: "driving",
  walking: "walking",
  transit: "transit",
  bicycling: "bicycling",
};

export const MAX_ROUTES_BATCH = 10;

async function fetchOneLeg(
  origin: string,
  destination: string,
  modeKey: string
): Promise<{ duration: string | null; distance: string | null }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { duration: null, distance: null };
  }

  const mode = MODE_MAP[modeKey] || "walking";

  try {
    const searchParams = new URLSearchParams({
      origin,
      destination,
      mode,
      key: apiKey,
    });

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${searchParams}`
    );

    if (!res.ok) {
      return { duration: null, distance: null };
    }

    const data = await res.json();
    if (!data.routes?.length) {
      return { duration: null, distance: null };
    }

    const leg = data.routes[0].legs[0];
    return {
      duration: leg.duration?.text ?? null,
      distance: leg.distance?.text ?? null,
    };
  } catch (error) {
    console.error("Directions API error:", error);
    return { duration: null, distance: null };
  }
}

/**
 * Compute travel time and distance for multiple origin–destination pairs in one tool call.
 * Each leg uses Google Directions API (parallel). Cap: MAX_ROUTES_BATCH per request.
 */
export async function computeRoutesBatch(input: {
  routes: RouteLegInput[];
}): Promise<{ routes: RouteLegResult[] }> {
  const legs = (input.routes ?? []).slice(0, MAX_ROUTES_BATCH);
  const settled = await Promise.all(
    legs.map(async (leg) => {
      const modeKey = leg.mode ?? "walking";
      const { duration, distance } = await fetchOneLeg(
        leg.origin,
        leg.destination,
        modeKey
      );
      return {
        origin: leg.origin,
        destination: leg.destination,
        mode: MODE_MAP[modeKey] || "walking",
        duration,
        distance,
      } satisfies RouteLegResult;
    })
  );

  return { routes: settled };
}
