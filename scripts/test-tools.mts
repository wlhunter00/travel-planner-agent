import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const results: { name: string; status: string; detail: string; ms: number }[] = [];

async function test(name: string, fn: () => Promise<string>) {
  const start = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - start;
    results.push({ name, status: "PASS", detail, ms });
    console.log(`  [  OK  ] ${name} (${ms}ms) — ${detail}`);
  } catch (err: unknown) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, status: "FAIL", detail: msg, ms });
    console.log(`  [ FAIL ] ${name} (${ms}ms) — ${msg}`);
  }
}

console.log("\n  Tool Integration Tests\n");
console.log("  Test destination: Rome, Italy\n");

// 1. Flights (Kiwi)
await test("Flights (Kiwi)", async () => {
  const { searchFlights } = await import("../src/lib/tools/kiwi.js");
  const res = await searchFlights({
    origin: "JFK",
    destination: "FCO",
    departureDate: "2026-06-15",
    adults: 1,
    cabinClass: "economy",
  });
  if (!res.flights.length) throw new Error("No flights returned");
  const f = res.flights[0];
  return `${res.flights.length} flights — cheapest: $${f.price} on ${f.airline}`;
});

// 2. Hotels (SerpAPI)
await test("Hotels (SerpAPI)", async () => {
  const { searchHotels } = await import("../src/lib/tools/serpapi-hotels.js");
  const res = await searchHotels({
    query: "hotels in central Rome",
    checkIn: "2026-06-15",
    checkOut: "2026-06-18",
    adults: 2,
    sortBy: "relevance",
  });
  if (!res.hotels.length) throw new Error("No hotels returned");
  return `${res.hotels.length} hotels — top: "${res.hotels[0].name}"`;
});

// 3. Google Places (search)
await test("Google Places (search)", async () => {
  const { searchPlaces } = await import("../src/lib/tools/google-places.js");
  const res = await searchPlaces({ query: "Colosseum Rome" });
  if (!res.places.length) throw new Error("No places returned");
  return `${res.places.length} places — top: "${res.places[0].name}"`;
});

// 4. Google Places (details)
await test("Google Places (details)", async () => {
  const { searchPlaces, getPlaceDetails } = await import(
    "../src/lib/tools/google-places.js"
  );
  const search = await searchPlaces({ query: "Trevi Fountain Rome" });
  if (!search.places.length) throw new Error("No places to get details for");
  const details = await getPlaceDetails({ placeId: search.places[0].placeId });
  if (!details) throw new Error("No details returned");
  return `"${details.name}" — rating: ${details.rating}`;
});

// 5. Google Directions (batch)
await test("Google Directions", async () => {
  const { computeRoutesBatch } = await import("../src/lib/tools/google-maps.js");
  const res = await computeRoutesBatch({
    routes: [
      { origin: "Colosseum, Rome", destination: "Vatican City", mode: "transit" },
      { origin: "Colosseum, Rome", destination: "Trevi Fountain, Rome", mode: "walking" },
    ],
  });
  const first = res.routes[0];
  if (!first?.duration && !first?.distance) throw new Error("No route returned");
  return `${res.routes.length} legs · first: ${first.duration ?? "?"} — ${first.distance ?? "?"}`;
});

// 6. Web Search (Exa)
await test("Web Search (Exa)", async () => {
  const { webSearch } = await import("../src/lib/tools/exa.js");
  const res = await webSearch({
    query: "best restaurants in Trastevere Rome 2026",
    numResults: 3,
  });
  if (!res.results.length) throw new Error("No results returned");
  return `${res.results.length} results — top: "${res.results[0].title}"`;
});

// 7. Tour Search (Exa-Tours)
await test("Tour Search (Exa-Tours)", async () => {
  const { searchTours } = await import("../src/lib/tools/exa-tours.js");
  const res = await searchTours({
    destination: "Rome",
    query: "food tour",
  });
  if (!res.tours.length) throw new Error("No tours returned");
  return `${res.tours.length} tours — top: "${res.tours[0].title}"`;
});

// 8. Peek MCP (connect + list tools)
await test("Peek MCP (connect)", async () => {
  const { createPeekClient } = await import("../src/lib/tools/peek.js");
  const peek = await createPeekClient();
  const toolNames = Object.keys(peek.tools);
  await peek.close();
  if (!toolNames.length) throw new Error("No tools returned from Peek MCP");
  return `${toolNames.length} tools available: ${toolNames.slice(0, 3).join(", ")}${toolNames.length > 3 ? "..." : ""}`;
});

// 9. Deep Research
await test("Deep Research", async () => {
  const { deepResearch } = await import("../src/lib/tools/research.js");
  const res = await deepResearch({
    query: "best day trips from Rome",
    destination: "Rome",
  });
  if (!res.results.length) throw new Error("No results returned");
  const sources = [...new Set(res.results.map((r) => r.source))];
  return `${res.results.length} results from ${sources.length} sources (${sources.join(", ")})`;
});

// Summary
const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n  Results: ${passed} passed, ${failed} failed out of ${results.length} tools\n`);
process.exit(failed > 0 ? 1 : 0);
