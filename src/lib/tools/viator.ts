interface TourSearchParams {
  destination: string;
  query?: string;
  category?: string;
}

interface TourResult {
  id: string;
  title: string;
  description?: string;
  duration?: string;
  price?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string;
  bookingUrl?: string;
}

export async function searchTours(params: TourSearchParams): Promise<{ tours: TourResult[] }> {
  const apiKey = process.env.VIATOR_API_KEY;
  if (!apiKey) {
    return { tours: [] };
  }

  const searchQuery = [params.query, params.destination, params.category]
    .filter(Boolean)
    .join(" ");

  try {
    const res = await fetch(
      "https://api.viator.com/partner/products/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json;version=2.0",
          "exp-api-key": apiKey,
        },
        body: JSON.stringify({
          searchTerm: searchQuery,
          currency: "USD",
          topX: "1-5",
          sortOrder: "TOP_SELLERS",
        }),
      }
    );

    if (!res.ok) return { tours: [] };

    const data = await res.json();
    const products = data.products || [];

    const tours: TourResult[] = products.slice(0, 5).map((p: Record<string, unknown>, i: number) => ({
      id: `tour-${i}`,
      title: p.title as string,
      description: (p.description as string)?.slice(0, 200),
      duration: p.duration
        ? formatViatorDuration(p.duration as Record<string, unknown>)
        : undefined,
      price: (p.pricing as Record<string, unknown>)?.summary
        ? (
            (p.pricing as Record<string, Record<string, number>>).summary.fromPrice
          )
        : undefined,
      currency: "USD",
      rating: (p.reviews as Record<string, number>)?.combinedAverageRating,
      reviewCount: (p.reviews as Record<string, number>)?.totalReviews,
      photoUrl: (p.images as Record<string, unknown>[])
        ?.[0]
        ? ((p.images as Record<string, Record<string, unknown>[]>[])[0] as unknown as Record<string, unknown>)?.variants
          ? undefined
          : undefined
        : undefined,
      bookingUrl: (p.productCode as string)
        ? `https://www.viator.com/tours/${p.productCode}`
        : undefined,
    }));

    return { tours };
  } catch (error) {
    console.error("Viator search error:", error);
    return { tours: [] };
  }
}

function formatViatorDuration(dur: Record<string, unknown>): string {
  if (dur.fixedDurationInMinutes) {
    const mins = dur.fixedDurationInMinutes as number;
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ""}`.trim();
    return `${mins}m`;
  }
  return "";
}
