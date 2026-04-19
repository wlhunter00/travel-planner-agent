interface PlaceSearchParams {
  query: string;
  location?: string;
  type?: string;
}

interface PlaceResult {
  placeId: string;
  name: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  types?: string[];
  lat?: number;
  lng?: number;
  photoUrl?: string;
}

interface PlaceDetails {
  placeId: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  description?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  hours?: string[];
  photoUrl?: string;
  reviews?: { author: string; rating: number; text: string }[];
  lat?: number;
  lng?: number;
}

export async function searchPlaces(params: PlaceSearchParams): Promise<{ places: PlaceResult[] }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { places: [] };

  const body: Record<string, unknown> = {
    textQuery: params.query,
    maxResultCount: 5,
  };

  if (params.location) {
    body.locationBias = {
      circle: {
        center: await geocodeToLatLng(params.location, apiKey),
        radius: 10000,
      },
    };
  }

  if (params.type) {
    body.includedType = params.type;
  }

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types,places.location,places.photos",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) return { places: [] };

    const data = await res.json();
    const places: PlaceResult[] = (data.places || []).map((p: Record<string, unknown>) => ({
      placeId: p.id as string,
      name: (p.displayName as Record<string, string>)?.text || "",
      address: p.formattedAddress as string,
      rating: p.rating as number,
      reviewCount: p.userRatingCount as number,
      types: p.types as string[],
      lat: (p.location as Record<string, number>)?.latitude,
      lng: (p.location as Record<string, number>)?.longitude,
      photoUrl: (p.photos as Record<string, string>[])?.[0]?.name
        ? `https://places.googleapis.com/v1/${(p.photos as Record<string, string>[])[0].name}/media?maxHeightPx=300&key=${apiKey}`
        : undefined,
    }));

    return { places };
  } catch (error) {
    console.error("Google Places search error:", error);
    return { places: [] };
  }
}

export async function getPlaceDetails(params: { placeId: string }): Promise<PlaceDetails | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${params.placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,editorialSummary,rating,userRatingCount,priceLevel,currentOpeningHours,photos,reviews,location",
        },
      }
    );

    if (!res.ok) return null;

    const p = await res.json();
    return {
      placeId: p.id,
      name: p.displayName?.text || "",
      address: p.formattedAddress,
      phone: p.nationalPhoneNumber,
      website: p.websiteUri,
      description: p.editorialSummary?.text,
      rating: p.rating,
      reviewCount: p.userRatingCount,
      priceLevel: p.priceLevel ? parsePriceLevel(p.priceLevel) : undefined,
      hours: p.currentOpeningHours?.weekdayDescriptions,
      photoUrl: p.photos?.[0]?.name
        ? `https://places.googleapis.com/v1/${p.photos[0].name}/media?maxHeightPx=400&key=${apiKey}`
        : undefined,
      reviews: (p.reviews || []).slice(0, 3).map((r: Record<string, unknown>) => ({
        author: (r.authorAttribution as Record<string, string>)?.displayName || "Anonymous",
        rating: r.rating as number,
        text: (r.text as Record<string, string>)?.text || "",
      })),
      lat: p.location?.latitude,
      lng: p.location?.longitude,
    };
  } catch (error) {
    console.error("Google Places detail error:", error);
    return null;
  }
}

async function geocodeToLatLng(
  location: string,
  apiKey: string
): Promise<{ latitude: number; longitude: number }> {
  if (location.includes(",")) {
    const [lat, lng] = location.split(",").map(Number);
    if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng };
  }

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
    );
    const data = await res.json();
    if (data.results?.[0]?.geometry?.location) {
      const { lat, lng } = data.results[0].geometry.location;
      return { latitude: lat, longitude: lng };
    }
  } catch {
    // fallback
  }

  return { latitude: 0, longitude: 0 };
}

function parsePriceLevel(level: string): number {
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? 2;
}
