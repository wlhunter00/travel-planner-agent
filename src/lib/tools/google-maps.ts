interface RouteParams {
  origin: string;
  destination: string;
  mode: string;
}

interface RouteResult {
  duration: string;
  distance: string;
  steps?: string[];
  mode: string;
}

const MODE_MAP: Record<string, string> = {
  driving: "driving",
  walking: "walking",
  transit: "transit",
  bicycling: "bicycling",
};

export async function computeTransitRoute(params: RouteParams): Promise<RouteResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const mode = MODE_MAP[params.mode] || "transit";

  try {
    const searchParams = new URLSearchParams({
      origin: params.origin,
      destination: params.destination,
      mode,
      key: apiKey,
    });

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${searchParams}`
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.routes?.length) return null;

    const route = data.routes[0];
    const leg = route.legs[0];

    return {
      duration: leg.duration.text,
      distance: leg.distance.text,
      steps: leg.steps?.slice(0, 5).map((s: Record<string, unknown>) =>
        (s.html_instructions as string)?.replace(/<[^>]*>/g, "")
      ),
      mode,
    };
  } catch (error) {
    console.error("Directions API error:", error);
    return null;
  }
}
