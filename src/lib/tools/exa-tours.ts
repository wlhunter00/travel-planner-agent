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

export async function searchTours(
  params: TourSearchParams
): Promise<{ tours: TourResult[] }> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return { tours: [] };

  const searchQuery = [
    "best tours activities",
    params.query,
    params.destination,
    params.category,
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: searchQuery,
        numResults: 5,
        useAutoprompt: true,
        type: "auto",
        includeDomains: [
          "viator.com",
          "getyourguide.com",
          "tripadvisor.com",
        ],
        contents: {
          text: { maxCharacters: 500 },
        },
      }),
    });

    if (!res.ok) return { tours: [] };

    const data = await res.json();
    const tours: TourResult[] = (data.results || []).map(
      (r: Record<string, unknown>, i: number) => ({
        id: `tour-${i}`,
        title: (r.title as string) || "",
        description: ((r.text as string) || "").slice(0, 200),
        bookingUrl: r.url as string,
      })
    );

    return { tours };
  } catch (error) {
    console.error("Exa tour search error:", error);
    return { tours: [] };
  }
}
