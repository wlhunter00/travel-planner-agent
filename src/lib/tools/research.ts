import { webSearch } from "./exa";
import { searchTours } from "./exa-tours";
import { searchPlaces } from "./google-places";

interface DeepResearchParams {
  query: string;
  destination: string;
  style?: string;
}

interface ResearchResult {
  source: string;
  title: string;
  snippet: string;
  url?: string;
  rating?: number;
  type: "web" | "place" | "tour";
}

interface LabeledSearch {
  label: string;
  kind: "web" | "tours" | "places";
  promise: Promise<unknown>;
}

export async function deepResearch(
  params: DeepResearchParams
): Promise<{ results: ResearchResult[]; summary: string }> {
  const { query, destination, style } = params;

  const searches: LabeledSearch[] = [
    { label: "Reddit", kind: "web", promise: webSearch({ query: `${query} ${destination} reddit.com`, numResults: 5 }) },
    { label: "Travel Blogs", kind: "web", promise: webSearch({ query: `${query} ${destination} lonelyplanet.com OR timeout.com 2026`, numResults: 5 }) },
    { label: "Local Guides", kind: "web", promise: webSearch({ query: `hidden gems ${destination} local recommendations`, numResults: 5 }) },
    { label: "Tours", kind: "tours", promise: searchTours({ destination, query }) },
    { label: "Google Places", kind: "places", promise: searchPlaces({ query: `${query} ${destination}` }) },
  ];

  const isDining =
    style === "foodie" ||
    style === "dining" ||
    /\b(restaurant|dining|food|eat|brunch|bistro|trattoria|izakaya)\b/i.test(query);

  if (isDining) {
    searches.push(
      { label: "Eater", kind: "web", promise: webSearch({ query: `best restaurants ${destination} site:eater.com`, numResults: 5 }) },
      { label: "Michelin Guide", kind: "web", promise: webSearch({ query: `best restaurants ${destination} site:guide.michelin.com`, numResults: 5 }) },
      { label: "Local Dining", kind: "web", promise: webSearch({ query: `best food ${destination} where locals eat`, numResults: 5 }) },
    );
  }
  if (style === "outdoors") {
    searches.push(
      { label: "Outdoors", kind: "web", promise: webSearch({ query: `best hikes day trips ${destination}`, numResults: 5 }) },
    );
  }
  if (style === "culture") {
    searches.push(
      { label: "Culture", kind: "web", promise: webSearch({ query: `must see museums cultural sites ${destination}`, numResults: 5 }) },
    );
  }

  const settled = await Promise.allSettled(searches.map((s) => s.promise));
  const allResults: ResearchResult[] = [];

  settled.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const val = result.value as Record<string, unknown>;
    const { label } = searches[i]!;

    if (val.results && Array.isArray(val.results)) {
      (val.results as Record<string, unknown>[]).forEach((r) => {
        allResults.push({
          source: label,
          title: (r.title as string) || "",
          snippet: (r.snippet as string) || "",
          url: r.url as string,
          type: "web",
        });
      });
    }

    if (val.tours && Array.isArray(val.tours)) {
      (val.tours as Record<string, unknown>[]).forEach((t) => {
        allResults.push({
          source: label,
          title: (t.title as string) || "",
          snippet: (t.description as string) || "",
          url: t.bookingUrl as string,
          rating: t.rating as number,
          type: "tour",
        });
      });
    }

    if (val.places && Array.isArray(val.places)) {
      (val.places as Record<string, unknown>[]).forEach((p) => {
        allResults.push({
          source: label,
          title: (p.name as string) || "",
          snippet: (p.address as string) || "",
          rating: p.rating as number,
          type: "place",
        });
      });
    }
  });

  const deduplicated = deduplicateResults(allResults);

  return {
    results: deduplicated.slice(0, 15),
    summary: `Found ${deduplicated.length} results from ${settled.filter((s) => s.status === "fulfilled").length} sources for "${query}" in ${destination}.`,
  };
}

function deduplicateResults(results: ResearchResult[]): ResearchResult[] {
  const seen = new Map<string, ResearchResult>();

  for (const r of results) {
    const key = r.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
    if (!seen.has(key)) {
      seen.set(key, r);
    }
  }

  return Array.from(seen.values()).sort((a, b) => (b.rating || 0) - (a.rating || 0));
}
