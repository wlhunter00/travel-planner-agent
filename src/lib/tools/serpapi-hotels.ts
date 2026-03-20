interface HotelSearchParams {
  query: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  sortBy: string;
  minPrice?: number;
  maxPrice?: number;
}

interface HotelResult {
  id: string;
  name: string;
  address?: string;
  pricePerNight?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string;
  bookingUrl?: string;
}

const SORT_MAP: Record<string, number> = {
  relevance: 3,
  lowest_price: 4,
  highest_rating: 6,
};

const EMPTY_HOTELS_NOTE =
  "No hotel results from the search provider. Aggregator inventory for dates many months out is often sparse or unreliable — do not retry the same query repeatedly. Prefer search_places + web_search (or official hotel sites) to name concrete properties and check pricing.";

export async function searchHotels(params: HotelSearchParams): Promise<{
  hotels: HotelResult[];
  note?: string;
}> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return { hotels: [], note: EMPTY_HOTELS_NOTE };
  }

  const searchParams = new URLSearchParams({
    engine: "google_hotels",
    q: params.query,
    check_in_date: params.checkIn,
    check_out_date: params.checkOut,
    adults: String(params.adults || 2),
    currency: "USD",
    gl: "us",
    hl: "en",
    sort_by: String(SORT_MAP[params.sortBy] || 3),
    api_key: apiKey,
  });

  if (params.minPrice != null && params.minPrice > 0) {
    searchParams.set("min_price", String(params.minPrice));
  }
  if (params.maxPrice != null && params.maxPrice > 0) {
    searchParams.set("max_price", String(params.maxPrice));
  }

  try {
    const res = await fetch(`https://serpapi.com/search.json?${searchParams}`);
    if (!res.ok) {
      return { hotels: [], note: EMPTY_HOTELS_NOTE };
    }

    const data = await res.json();
    const properties = data.properties || [];
    if (properties.length === 0) {
      return { hotels: [], note: EMPTY_HOTELS_NOTE };
    }

    const hotels: HotelResult[] = properties.slice(0, 5).map((p: Record<string, unknown>, i: number) => ({
      id: `hotel-${i}`,
      name: p.name as string,
      address: (p.description as string) || undefined,
      pricePerNight: (p.rate_per_night as Record<string, unknown>)?.lowest
        ? parseFloat(String((p.rate_per_night as Record<string, unknown>).lowest).replace(/[^0-9.]/g, ""))
        : undefined,
      currency: "USD",
      rating: (p.overall_rating as number) || undefined,
      reviewCount: (p.reviews as number) || undefined,
      photoUrl: (p.images as Record<string, string>[])?.[0]?.thumbnail || undefined,
      bookingUrl: (p.link as string) || undefined,
    }));

    return { hotels };
  } catch (error) {
    console.error("SerpAPI hotel search error:", error);
    return { hotels: [], note: EMPTY_HOTELS_NOTE };
  }
}
