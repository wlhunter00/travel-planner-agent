interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  cabinClass: string;
}

interface FlightResult {
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

const CABIN_MAP: Record<string, string> = {
  economy: "M",
  premium_economy: "W",
  business: "C",
  first: "F",
};

export async function searchFlights(params: FlightSearchParams): Promise<{ flights: FlightResult[] }> {
  const { origin, destination, departureDate, returnDate, adults, cabinClass } = params;

  const searchParams = new URLSearchParams({
    fly_from: origin,
    fly_to: destination,
    date_from: formatDate(departureDate),
    date_to: formatDate(departureDate),
    adults: String(adults || 1),
    curr: "USD",
    locale: "en",
    selected_cabins: CABIN_MAP[cabinClass] || "M",
    limit: "5",
    sort: "price",
  });

  if (returnDate) {
    searchParams.set("return_from", formatDate(returnDate));
    searchParams.set("return_to", formatDate(returnDate));
    searchParams.set("flight_type", "round");
  } else {
    searchParams.set("flight_type", "oneway");
  }

  try {
    const res = await fetch(
      `https://api.tequila.kiwi.com/v2/search?${searchParams}`,
      {
        headers: {
          apikey: process.env.KIWI_API_KEY || "",
        },
      }
    );

    if (!res.ok) {
      return { flights: [] };
    }

    const data = await res.json();
    const flights: FlightResult[] = (data.data || []).slice(0, 5).map((f: Record<string, unknown>, i: number) => {
      const route = (f.route as Record<string, unknown>[]) || [];
      const firstLeg = route[0] || {};
      return {
        id: `flight-${i}`,
        airline: (firstLeg.airline as string) || (f.airlines as string[])?.[0] || "Unknown",
        flightNumber: (firstLeg.flight_no as string) ? `${firstLeg.airline}${firstLeg.flight_no}` : undefined,
        origin,
        destination,
        departureTime: (f.dTime as string) || departureDate,
        arrivalTime: (f.aTime as string) || "",
        duration: formatDuration(f.duration as Record<string, number>),
        stops: route.length - 1,
        price: f.price as number,
        currency: "USD",
        bookingUrl: f.deep_link as string,
        cabinClass,
      };
    });

    return { flights };
  } catch (error) {
    console.error("Kiwi flight search error:", error);
    return { flights: [] };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatDuration(dur: Record<string, number> | undefined): string {
  if (!dur) return "";
  const totalSec = dur.departure || dur.total || 0;
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  return `${hours}h ${mins}m`;
}
