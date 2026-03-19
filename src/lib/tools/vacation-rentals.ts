/**
 * SerpAPI Google Vacation Rentals — aggregates Airbnb, VRBO, Booking.com
 * vacation rentals from Google's vacation rental search.
 *
 * Uses the same SerpAPI key as hotel search, just a different engine.
 */

interface VacationRentalSearchParams {
  query: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  sortBy: string;
  minPrice?: number;
  maxPrice?: number;
}

interface VacationRentalResult {
  id: string;
  name: string;
  source: string;
  address?: string;
  pricePerNight?: number;
  totalPrice?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string;
  bookingUrl?: string;
  propertyType?: string;
  amenities?: string[];
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
}

const SORT_MAP: Record<string, number> = {
  relevance: 1,
  lowest_price: 2,
  highest_rating: 3,
};

export async function searchVacationRentals(
  params: VacationRentalSearchParams
): Promise<{ rentals: VacationRentalResult[] }> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return { rentals: [] };
  }

  const searchParams = new URLSearchParams({
    engine: "google_vacation_rentals",
    q: params.query,
    check_in_date: params.checkIn,
    check_out_date: params.checkOut,
    adults: String(params.adults || 2),
    currency: "USD",
    gl: "us",
    hl: "en",
    api_key: apiKey,
  });

  if (params.sortBy && SORT_MAP[params.sortBy]) {
    searchParams.set("sort_by", String(SORT_MAP[params.sortBy]));
  }
  if (params.minPrice) {
    searchParams.set("min_price", String(params.minPrice));
  }
  if (params.maxPrice) {
    searchParams.set("max_price", String(params.maxPrice));
  }

  try {
    const res = await fetch(`https://serpapi.com/search.json?${searchParams}`);
    if (!res.ok) return { rentals: [] };

    const data = await res.json();
    const properties = data.properties || [];

    const rentals: VacationRentalResult[] = properties
      .slice(0, 8)
      .map((p: Record<string, unknown>, i: number) => {
        const prices = p.prices as Record<string, unknown>[] | undefined;
        const bestPrice = prices?.[0];

        return {
          id: `rental-${i}`,
          name: (p.name as string) || "",
          source: extractSource(prices),
          address: (p.description as string) || undefined,
          pricePerNight: bestPrice
            ? parsePrice((bestPrice as Record<string, unknown>).rate_per_night)
            : undefined,
          totalPrice: bestPrice
            ? parsePrice((bestPrice as Record<string, unknown>).total)
            : undefined,
          currency: "USD",
          rating: (p.overall_rating as number) || undefined,
          reviewCount: (p.reviews as number) || undefined,
          photoUrl: (p.images as Record<string, string>[])?.[0]?.thumbnail || undefined,
          bookingUrl:
            (bestPrice as Record<string, unknown>)?.link as string ||
            (p.link as string) ||
            undefined,
          propertyType: (p.type as string) || undefined,
          amenities: (p.amenities as string[]) || undefined,
          bedrooms: (p.bedrooms as number) || undefined,
          bathrooms: (p.bathrooms as number) || undefined,
          maxGuests: (p.guests as number) || undefined,
        };
      });

    return { rentals };
  } catch (error) {
    console.error("SerpAPI vacation rental search error:", error);
    return { rentals: [] };
  }
}

function extractSource(prices: Record<string, unknown>[] | undefined): string {
  if (!prices?.[0]) return "Vacation Rental";
  const source = (prices[0] as Record<string, unknown>).source as string;
  if (!source) return "Vacation Rental";
  if (source.toLowerCase().includes("airbnb")) return "Airbnb";
  if (source.toLowerCase().includes("vrbo")) return "VRBO";
  if (source.toLowerCase().includes("booking")) return "Booking.com";
  return source;
}

function parsePrice(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value.replace(/[^0-9.]/g, ""));
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}
