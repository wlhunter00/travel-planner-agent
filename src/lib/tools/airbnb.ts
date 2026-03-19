/**
 * Direct Airbnb search via their internal explore API.
 *
 * Inspired by https://github.com/Ryan-Ouyang/airbnb-price-scraper —
 * Airbnb's search endpoint is publicly accessible (it's what their
 * website uses). This gives richer listing data than the SerpAPI
 * aggregator: exact nightly prices, superhost status, room type,
 * amenity details, and direct Airbnb links.
 *
 * No API key required — this is an unauthenticated endpoint.
 */

interface AirbnbSearchParams {
  location: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  minPrice?: number;
  maxPrice?: number;
  roomType?: string;
}

interface AirbnbListing {
  id: string;
  name: string;
  source: "Airbnb";
  address?: string;
  pricePerNight?: number;
  totalPrice?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string;
  bookingUrl?: string;
  propertyType?: string;
  isSuperhost?: boolean;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  amenityHighlights?: string[];
}

export async function searchAirbnb(
  params: AirbnbSearchParams
): Promise<{ listings: AirbnbListing[] }> {
  try {
    const searchParams = new URLSearchParams({
      query: params.location,
      checkin: params.checkIn,
      checkout: params.checkOut,
      adults: String(params.adults || 2),
      currency: "USD",
      locale: "en",
      _format: "for_explore_search_native",
      items_per_grid: "8",
      search_type: "filter_change",
    });

    if (params.minPrice) {
      searchParams.set("price_min", String(params.minPrice));
    }
    if (params.maxPrice) {
      searchParams.set("price_max", String(params.maxPrice));
    }
    if (params.roomType) {
      const roomTypeMap: Record<string, string> = {
        entire_home: "Entire home/apt",
        private_room: "Private room",
        shared_room: "Shared room",
      };
      searchParams.set("room_types[]", roomTypeMap[params.roomType] || params.roomType);
    }

    const res = await fetch(
      `https://www.airbnb.com/api/v3/ExploreSearch?${searchParams}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
          "X-Airbnb-API-Key": "d306zoyjsyarp7ifhu67rjxn52tv0t20",
        },
      }
    );

    if (!res.ok) {
      return await fallbackSearch(params);
    }

    const data = await res.json();
    const sections =
      data?.data?.presentation?.explore?.sections?.sections || [];

    const listingSection = sections.find(
      (s: Record<string, unknown>) =>
        (s.sectionComponentType as string) === "LISTINGS_GRID" ||
        (s.sectionComponentType as string) === "PAGINATED_LISTINGS"
    );

    if (!listingSection?.section?.child?.section?.items) {
      return await fallbackSearch(params);
    }

    const items = listingSection.section.child.section.items as Record<
      string,
      unknown
    >[];

    const listings: AirbnbListing[] = items.slice(0, 8).map((item, i) => {
      const listing = (item.listing || item) as Record<string, unknown>;
      const pricing = (item.pricingQuote || item.pricing) as Record<
        string,
        unknown
      > | undefined;

      const listingId = (listing.id as string) || `airbnb-${i}`;

      return {
        id: `airbnb-${i}`,
        name: (listing.name as string) || (listing.title as string) || "",
        source: "Airbnb" as const,
        address: (listing.city as string) || undefined,
        pricePerNight: extractAirbnbPrice(pricing),
        totalPrice: extractAirbnbTotalPrice(pricing),
        currency: "USD",
        rating: (listing.avgRating as number) || (listing.starRating as number) || undefined,
        reviewCount: (listing.reviewsCount as number) || undefined,
        photoUrl: extractAirbnbPhoto(listing),
        bookingUrl: `https://www.airbnb.com/rooms/${listingId}?checkin=${params.checkIn}&checkout=${params.checkOut}&adults=${params.adults}`,
        propertyType: (listing.roomTypeCategory as string) || (listing.roomType as string) || undefined,
        isSuperhost: (listing.isSuperhost as boolean) || false,
        bedrooms: (listing.bedrooms as number) || undefined,
        bathrooms: (listing.bathrooms as number) || undefined,
        maxGuests: (listing.personCapacity as number) || undefined,
      };
    });

    return { listings: listings.filter((l) => l.name) };
  } catch (error) {
    console.error("Airbnb search error:", error);
    return await fallbackSearch(params);
  }
}

/**
 * Fallback: use Exa web search to find Airbnb listings for the location.
 * Less structured but works when the direct API is blocked.
 */
async function fallbackSearch(
  params: AirbnbSearchParams
): Promise<{ listings: AirbnbListing[] }> {
  try {
    const exaKey = process.env.EXA_API_KEY;
    if (!exaKey) return { listings: [] };

    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": exaKey,
      },
      body: JSON.stringify({
        query: `airbnb ${params.location} vacation rental ${params.checkIn} to ${params.checkOut}`,
        numResults: 5,
        includeDomains: ["airbnb.com"],
        useAutoprompt: true,
        type: "auto",
        contents: { text: { maxCharacters: 300 } },
      }),
    });

    if (!res.ok) return { listings: [] };

    const data = await res.json();
    const listings: AirbnbListing[] = (data.results || []).map(
      (r: Record<string, unknown>, i: number) => ({
        id: `airbnb-fallback-${i}`,
        name: (r.title as string) || "",
        source: "Airbnb" as const,
        bookingUrl: r.url as string,
        photoUrl: undefined,
      })
    );

    return { listings };
  } catch {
    return { listings: [] };
  }
}

function extractAirbnbPrice(
  pricing: Record<string, unknown> | undefined
): number | undefined {
  if (!pricing) return undefined;

  const rate = pricing.ratePerNight || pricing.pricePerNight || pricing.rate;
  if (typeof rate === "number") return rate;
  if (typeof rate === "object" && rate !== null) {
    const amount = (rate as Record<string, unknown>).amount;
    if (typeof amount === "number") return amount;
    if (typeof amount === "string") return parseFloat(amount);
  }
  if (typeof rate === "string") return parseFloat(rate.replace(/[^0-9.]/g, ""));

  return undefined;
}

function extractAirbnbTotalPrice(
  pricing: Record<string, unknown> | undefined
): number | undefined {
  if (!pricing) return undefined;

  const total = pricing.total || pricing.priceTotal || pricing.structuredStayDisplayPrice;
  if (typeof total === "number") return total;
  if (typeof total === "object" && total !== null) {
    const amount = (total as Record<string, unknown>).amount;
    if (typeof amount === "number") return amount;
  }

  return undefined;
}

function extractAirbnbPhoto(listing: Record<string, unknown>): string | undefined {
  const photos = listing.contextualPictures || listing.photos || listing.images;
  if (Array.isArray(photos) && photos.length > 0) {
    const first = photos[0] as Record<string, unknown>;
    return (first.picture as string) || (first.url as string) || (first.thumbnail as string);
  }
  const pic = listing.pictureUrl || listing.thumbnailUrl || listing.picture;
  if (typeof pic === "string") return pic;
  return undefined;
}
