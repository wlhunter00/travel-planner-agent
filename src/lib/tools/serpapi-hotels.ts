interface HotelSearchParams {
  query: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  sortBy: string;
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

export async function searchHotels(params: HotelSearchParams): Promise<{ hotels: HotelResult[] }> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return { hotels: [] };
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

  try {
    const res = await fetch(`https://serpapi.com/search.json?${searchParams}`);
    if (!res.ok) return { hotels: [] };

    const data = await res.json();
    const properties = data.properties || [];

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
    return { hotels: [] };
  }
}
