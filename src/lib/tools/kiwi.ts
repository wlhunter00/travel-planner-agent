interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  cabinClass: string;
}

export interface FlightResult {
  id: string;
  airline: string;
  flightNumber?: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: number;
  price?: number;
  currency?: string;
  bookingUrl?: string;
  cabinClass?: string;
}

export interface FlightSearchResponse {
  flights: FlightResult[];
  /** Present when inputs are invalid or the API reports an error — the model should retry with corrected IATA codes */
  error?: string;
}

export interface MultiCitySegment {
  leg: number;
  origin: string;
  destination: string;
  date: string;
  airline?: string;
  flightNumber?: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: string;
  stops?: number;
  /** True when airline/times are populated (from multi-city response or one-way fallback). */
  hasDetails: boolean;
}

export interface MultiCityFlightResult {
  id: string;
  /** Total combined price across all segments */
  totalPrice?: number;
  currency: string;
  segments: MultiCitySegment[];
  bookingUrl?: string;
  cabinClass?: string;
}

export interface MultiCityFlightSearchResponse {
  results: MultiCityFlightResult[];
  error?: string;
}

/** Common city names / metro labels → primary IATA (Google Flights expects airport codes). */
const IATA_ALIASES: Record<string, string> = {
  "new york": "JFK",
  "nyc": "JFK",
  "new york city": "JFK",
  lisbon: "LIS",
  porto: "OPO",
  oporto: "OPO",
  london: "LHR",
  paris: "CDG",
  rome: "FCO",
  madrid: "MAD",
  barcelona: "BCN",
  amsterdam: "AMS",
  frankfurt: "FRA",
  munich: "MUC",
  dublin: "DUB",
  zurich: "ZRH",
  vienna: "VIE",
  athens: "ATH",
  tokyo: "NRT",
  osaka: "KIX",
  seoul: "ICN",
  singapore: "SIN",
  "hong kong": "HKG",
  bangkok: "BKK",
  dubai: "DXB",
  sydney: "SYD",
  melbourne: "MEL",
  toronto: "YYZ",
  vancouver: "YVR",
  montreal: "YUL",
  chicago: "ORD",
  "los angeles": "LAX",
  "san francisco": "SFO",
  dc: "IAD",
  washington: "IAD",
  boston: "BOS",
  miami: "MIA",
  atlanta: "ATL",
  dallas: "DFW",
  denver: "DEN",
  seattle: "SEA",
  phoenix: "PHX",
  honolulu: "HNL",
  "san diego": "SAN",
  philadelphia: "PHL",
  houston: "IAH",
};

const CABIN_MAP: Record<string, number> = {
  economy: 1,
  premium_economy: 2,
  business: 3,
  first: 4,
};

function normalizeToIata(raw: string): { code: string | null; hint: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { code: null, hint: "empty location" };

  const upper = trimmed.toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]{3}$/.test(upper)) return { code: upper, hint: "" };

  const key = trimmed.toLowerCase().replace(/\s+/g, " ").trim();
  const direct = IATA_ALIASES[key];
  if (direct) return { code: direct, hint: "" };

  const compact = key.replace(/\s/g, "");
  for (const [k, v] of Object.entries(IATA_ALIASES)) {
    if (k.replace(/\s/g, "") === compact) return { code: v, hint: "" };
  }

  return {
    code: null,
    hint: `could not resolve "${trimmed}" to a 3-letter IATA code (e.g. JFK, LIS, OPO)`,
  };
}

export interface MultiCityLeg {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
}

export interface MultiCitySearchParams {
  legs: MultiCityLeg[];
  adults: number;
  cabinClass: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns an error message if the date is malformed or before today (UTC). */
function validateNotPastDate(date: string, label: string): string | null {
  const trimmed = date.trim();
  if (!ISO_DATE_RE.test(trimmed)) {
    return `${label} must be YYYY-MM-DD (got "${date}")`;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (trimmed < today) {
    return `${label} date ${trimmed} is in the past (today is ${today}). Use a future date.`;
  }
  return null;
}

function formatDuration(totalMinutes: number | undefined): string {
  if (!totalMinutes) return "";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins > 0 ? `${mins}m` : ""}`.trim();
}

function buildGoogleFlightsUrl(
  origin: string,
  destination: string,
  departure: string,
  returnDate?: string
): string {
  const base = "https://www.google.com/travel/flights";
  const params = new URLSearchParams({
    q: `flights from ${origin} to ${destination} on ${departure}${returnDate ? ` returning ${returnDate}` : ""}`,
  });
  return `${base}?${params}`;
}

function buildMultiCityGoogleFlightsUrl(legs: { origin: string; destination: string; date: string }[]): string {
  const base = "https://www.google.com/travel/flights";
  const desc = legs.map((l) => `${l.origin}→${l.destination} on ${l.date}`).join("; ");
  return `${base}?${new URLSearchParams({ q: `multi-city ${desc}` })}`;
}

type NormalizedMultiLeg = { departure_id: string; arrival_id: string; date: string };

function airportIdFromFlight(f: Record<string, unknown>, which: "departure" | "arrival"): string | undefined {
  const key = which === "departure" ? "departure_airport" : "arrival_airport";
  const ap = f[key] as Record<string, string> | undefined;
  return ap?.id;
}

/** Split SerpAPI `flights` rows into one group per multi-city leg (connections stay in the same group). */
function groupFlightsIntoLegs(
  flightsArr: Record<string, unknown>[],
  normalized: NormalizedMultiLeg[]
): Record<string, unknown>[][] {
  const groups: Record<string, unknown>[][] = [];
  let i = 0;

  for (const leg of normalized) {
    const group: Record<string, unknown>[] = [];

    while (i < flightsArr.length && group.length === 0) {
      const dep = airportIdFromFlight(flightsArr[i]!, "departure");
      if (dep === leg.departure_id) break;
      i++;
    }

    while (i < flightsArr.length) {
      const f = flightsArr[i]!;
      const dep = airportIdFromFlight(f, "departure");
      const arr = airportIdFromFlight(f, "arrival");

      if (group.length === 0) {
        if (dep !== leg.departure_id) break;
        group.push(f);
        i++;
        if (arr === leg.arrival_id) break;
        continue;
      }

      const lastArr = airportIdFromFlight(group[group.length - 1]!, "arrival");
      if (dep === lastArr) {
        group.push(f);
        i++;
        if (arr === leg.arrival_id) break;
        continue;
      }
      break;
    }

    groups.push(group);
  }

  return groups;
}

function segmentFromFlightGroup(
  group: Record<string, unknown>[],
  leg: NormalizedMultiLeg,
  legIndex: number
): MultiCitySegment {
  if (group.length === 0) {
    return {
      leg: legIndex + 1,
      origin: leg.departure_id,
      destination: leg.arrival_id,
      date: leg.date,
      hasDetails: false,
    };
  }

  const first = group[0]!;
  const last = group[group.length - 1]!;
  const depAirport = first.departure_airport as Record<string, string> | undefined;
  const arrAirport = last.arrival_airport as Record<string, string> | undefined;

  let totalMin = 0;
  for (const f of group) {
    const d = f.duration as number | undefined;
    if (typeof d === "number") totalMin += d;
  }

  return {
    leg: legIndex + 1,
    origin: depAirport?.id || leg.departure_id,
    destination: arrAirport?.id || leg.arrival_id,
    date: leg.date,
    airline: (first.airline as string) || undefined,
    flightNumber: (first.flight_number as string) || undefined,
    departureTime: depAirport?.time || undefined,
    arrivalTime: arrAirport?.time || undefined,
    duration: totalMin > 0 ? formatDuration(totalMin) : undefined,
    stops: Math.max(0, group.length - 1),
    hasDetails: true,
  };
}

/** When the combined itinerary omits later-leg rows, fill from a one-way search (top result) so callers avoid N extra tool calls. */
async function enrichSegmentsMissingDetails(
  results: MultiCityFlightResult[],
  adults: number,
  cabinClass: string
): Promise<void> {
  const routeKeys = new Map<string, { origin: string; destination: string; date: string }>();
  for (const r of results) {
    for (const seg of r.segments) {
      if (!seg.hasDetails) {
        const k = `${seg.origin}|${seg.destination}|${seg.date}`;
        routeKeys.set(k, { origin: seg.origin, destination: seg.destination, date: seg.date });
      }
    }
  }
  if (routeKeys.size === 0) return;

  const bestByKey = new Map<string, FlightResult | undefined>();
  await Promise.all(
    [...routeKeys.entries()].map(async ([k, p]) => {
      const res = await searchFlights({
        origin: p.origin,
        destination: p.destination,
        departureDate: p.date,
        adults,
        cabinClass,
      });
      bestByKey.set(k, res.flights[0]);
    })
  );

  for (const r of results) {
    r.segments = r.segments.map((seg) => {
      if (seg.hasDetails) return seg;
      const k = `${seg.origin}|${seg.destination}|${seg.date}`;
      const f = bestByKey.get(k);
      if (!f) return seg;
      return {
        ...seg,
        airline: f.airline,
        flightNumber: f.flightNumber,
        departureTime: f.departureTime,
        arrivalTime: f.arrivalTime,
        duration: f.duration,
        stops: f.stops,
        hasDetails: true,
      };
    });
  }
}

function mapItinerariesToFlights(
  itineraries: Record<string, unknown>[],
  normOrigin: string,
  normDest: string,
  departureDate: string,
  returnDate: string | undefined,
  cabinClass: string
): FlightResult[] {
  return itineraries.map((itinerary: Record<string, unknown>, i: number) => {
    const legs = (itinerary.flights as Record<string, unknown>[]) || [];
    const firstLeg = legs[0] || {};
    const lastLeg = legs[legs.length - 1] || firstLeg;
    const depAirport = firstLeg.departure_airport as Record<string, string> | undefined;
    const arrAirport = lastLeg.arrival_airport as Record<string, string> | undefined;

    return {
      id: `flight-${i}`,
      airline: (firstLeg.airline as string) || "Unknown",
      flightNumber: firstLeg.flight_number as string,
      origin: depAirport?.id || normOrigin,
      destination: arrAirport?.id || normDest,
      departureTime: depAirport?.time || departureDate,
      arrivalTime: arrAirport?.time || "",
      duration: formatDuration(itinerary.total_duration as number),
      stops: Math.max(0, legs.length - 1),
      price: itinerary.price as number,
      currency: "USD",
      bookingUrl: buildGoogleFlightsUrl(normOrigin, normDest, departureDate, returnDate),
      cabinClass,
    };
  });
}

export async function searchFlights(params: FlightSearchParams): Promise<FlightSearchResponse> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return { flights: [], error: "SERPAPI_API_KEY is not configured" };
  }

  const { origin: originRaw, destination: destRaw, departureDate, returnDate, adults, cabinClass } =
    params;

  const o = normalizeToIata(originRaw);
  const d = normalizeToIata(destRaw);
  if (!o.code) {
    return { flights: [], error: `Invalid origin: ${o.hint}` };
  }
  if (!d.code) {
    return { flights: [], error: `Invalid destination: ${d.hint}` };
  }

  const depErr = validateNotPastDate(departureDate, "Departure");
  if (depErr) {
    return { flights: [], error: depErr };
  }
  if (returnDate) {
    const retErr = validateNotPastDate(returnDate, "Return");
    if (retErr) {
      return { flights: [], error: retErr };
    }
  }

  const searchParams = new URLSearchParams({
    engine: "google_flights",
    departure_id: o.code,
    arrival_id: d.code,
    outbound_date: departureDate,
    adults: String(adults || 1),
    travel_class: String(CABIN_MAP[cabinClass] || 1),
    currency: "USD",
    hl: "en",
    api_key: apiKey,
  });

  if (returnDate) {
    searchParams.set("type", "1");
    searchParams.set("return_date", returnDate);
  } else {
    searchParams.set("type", "2");
  }

  const url = `https://serpapi.com/search?${searchParams}`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      console.error("[searchFlights] SerpAPI HTTP error", res.status, url);
      return { flights: [], error: `Flight search failed (HTTP ${res.status})` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    if (data.error) {
      console.error("[searchFlights] SerpAPI error payload", data.error, url);
      return { flights: [], error: String(data.error) };
    }

    const bestFlights = (data.best_flights as Record<string, unknown>[]) || [];
    const otherFlights = (data.other_flights as Record<string, unknown>[]) || [];
    const allFlights = [...bestFlights, ...otherFlights].slice(0, 5);

    if (allFlights.length === 0) {
      console.warn("[searchFlights] No itineraries returned for", o.code, "→", d.code, url);
    }

    const flights = mapItinerariesToFlights(allFlights, o.code, d.code, departureDate, returnDate, cabinClass);

    return { flights };
  } catch (error) {
    console.error("[searchFlights] Google Flights search error:", error, url);
    return { flights: [], error: error instanceof Error ? error.message : "Flight search request failed" };
  }
}

/**
 * Multi-city / open-jaw: SerpAPI type=3 + multi_city_json (each leg: departure_id, arrival_id, date).
 */
export async function searchMultiCityFlights(
  params: MultiCitySearchParams
): Promise<MultiCityFlightSearchResponse> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return { results: [], error: "SERPAPI_API_KEY is not configured" };
  }

  const { legs, adults, cabinClass } = params;
  if (!legs?.length) {
    return { results: [], error: "multi-city search requires at least one leg" };
  }

  const normalized: { departure_id: string; arrival_id: string; date: string }[] = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    const o = normalizeToIata(leg.origin);
    const d = normalizeToIata(leg.destination);
    if (!o.code) {
      return { results: [], error: `Leg ${i + 1} invalid origin: ${o.hint}` };
    }
    if (!d.code) {
      return { results: [], error: `Leg ${i + 1} invalid destination: ${d.hint}` };
    }
    const dateErr = validateNotPastDate(leg.date, `Leg ${i + 1}`);
    if (dateErr) {
      return { results: [], error: dateErr };
    }
    normalized.push({
      departure_id: o.code,
      arrival_id: d.code,
      date: leg.date,
    });
  }

  const searchParams = new URLSearchParams({
    engine: "google_flights",
    type: "3",
    multi_city_json: JSON.stringify(normalized),
    adults: String(adults || 1),
    travel_class: String(CABIN_MAP[cabinClass] || 1),
    currency: "USD",
    hl: "en",
    api_key: apiKey,
  });

  const url = `https://serpapi.com/search?${searchParams}`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      console.error("[searchMultiCityFlights] SerpAPI HTTP error", res.status, url);
      return { results: [], error: `Multi-city flight search failed (HTTP ${res.status})` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    if (data.error) {
      console.error("[searchMultiCityFlights] SerpAPI error payload", data.error, url);
      return { results: [], error: String(data.error) };
    }

    const bestFlights = (data.best_flights as Record<string, unknown>[]) || [];
    const otherFlights = (data.other_flights as Record<string, unknown>[]) || [];
    const allFlights = [...bestFlights, ...otherFlights].slice(0, 5);

    const bookingUrl = buildMultiCityGoogleFlightsUrl(
      normalized.map((n) => ({
        origin: n.departure_id,
        destination: n.arrival_id,
        date: n.date,
      }))
    );

    const results: MultiCityFlightResult[] = allFlights.map(
      (itinerary: Record<string, unknown>, i: number) => {
        const flightsArr = (itinerary.flights as Record<string, unknown>[]) || [];
        const groups = groupFlightsIntoLegs(flightsArr, normalized);
        const segments: MultiCitySegment[] = normalized.map((leg, legIdx) =>
          segmentFromFlightGroup(groups[legIdx] ?? [], leg, legIdx)
        );

        return {
          id: `mc-${i}`,
          totalPrice: itinerary.price as number | undefined,
          currency: "USD",
          segments,
          bookingUrl,
          cabinClass,
        };
      }
    );

    if (results.length === 0) {
      console.warn("[searchMultiCityFlights] No itineraries returned", url);
    }

    await enrichSegmentsMissingDetails(results, adults || 1, cabinClass);

    return { results };
  } catch (error) {
    console.error("[searchMultiCityFlights] error:", error, url);
    return {
      results: [],
      error: error instanceof Error ? error.message : "Multi-city flight search request failed",
    };
  }
}
