import { NextResponse } from "next/server";
import { getTrip } from "@/lib/trips-store";
import { createEvents, type EventAttributes } from "ics";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const format = searchParams.get("format") || "json";

  if (!tripId) {
    return NextResponse.json({ error: "Missing tripId" }, { status: 400 });
  }

  const trip = await getTrip(tripId);
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  if (format === "json") {
    return new Response(JSON.stringify(trip.state, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${slugify(trip.name)}.json"`,
      },
    });
  }

  if (format === "csv") {
    const csv = tripToCSV(trip);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${slugify(trip.name)}.csv"`,
      },
    });
  }

  if (format === "ical") {
    const ical = tripToIcal(trip);
    return new Response(ical, {
      headers: {
        "Content-Type": "text/calendar",
        "Content-Disposition": `attachment; filename="${slugify(trip.name)}.ics"`,
      },
    });
  }

  return NextResponse.json({ error: "Invalid format" }, { status: 400 });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function tripToCSV(trip: {
  state: {
    days: { date: string; cityId: string; daySummary?: string; activities: { title: string; startTime?: string; endTime?: string; duration?: string; address?: string; type: string; notes?: string }[] }[];
    flights: { airline: string; origin: string; destination: string; departureTime: string; arrivalTime: string; duration: string; price?: number; bookingUrl?: string }[];
    hotels: { name: string; address?: string; pricePerNight?: number; checkIn?: string; checkOut?: string; bookingUrl?: string }[];
    cities: { name: string; days: number }[];
  };
}): string {
  const rows: string[][] = [];

  rows.push(["Type", "Date", "Time", "Title", "Location", "Duration", "Price", "Notes", "Link"]);

  for (const flight of trip.state.flights) {
    rows.push([
      "Flight",
      flight.departureTime?.split("T")[0] || "",
      flight.departureTime?.split("T")[1]?.slice(0, 5) || "",
      `${flight.airline}: ${flight.origin} → ${flight.destination}`,
      "",
      flight.duration,
      flight.price ? `$${flight.price}` : "",
      "",
      flight.bookingUrl || "",
    ]);
  }

  for (const hotel of trip.state.hotels) {
    rows.push([
      "Hotel",
      hotel.checkIn || "",
      "",
      hotel.name,
      hotel.address || "",
      "",
      hotel.pricePerNight ? `$${hotel.pricePerNight}/night` : "",
      `${hotel.checkIn || ""} to ${hotel.checkOut || ""}`,
      hotel.bookingUrl || "",
    ]);
  }

  for (const day of trip.state.days) {
    for (const activity of day.activities) {
      rows.push([
        activity.type,
        day.date,
        activity.startTime || "",
        activity.title,
        activity.address || "",
        activity.duration || "",
        "",
        activity.notes || "",
        "",
      ]);
    }
  }

  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function tripToIcal(trip: {
  name: string;
  state: {
    days: { date: string; activities: { title: string; startTime?: string; endTime?: string; duration?: string; address?: string; type: string }[] }[];
    flights: { airline: string; origin: string; destination: string; departureTime: string; arrivalTime: string; duration: string }[];
  };
}): string {
  const events: EventAttributes[] = [];

  for (const flight of trip.state.flights) {
    const start = parseDateTime(flight.departureTime);
    const end = parseDateTime(flight.arrivalTime);
    if (start && end) {
      events.push({
        title: `${flight.airline}: ${flight.origin} → ${flight.destination}`,
        start: start as [number, number, number, number, number],
        end: end as [number, number, number, number, number],
        description: `Duration: ${flight.duration}`,
      });
    }
  }

  for (const day of trip.state.days) {
    for (const activity of day.activities) {
      const dateArr = parseDateOnly(day.date);
      if (dateArr) {
        events.push({
          title: activity.title,
          start: dateArr as [number, number, number],
          duration: { hours: 2 },
          location: activity.address,
          description: `Type: ${activity.type}`,
        });
      }
    }
  }

  if (events.length === 0) {
    return "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";
  }

  const { value, error } = createEvents(events);
  if (error) {
    console.error("iCal generation error:", error);
    return "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";
  }

  return value || "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";
}

function parseDateTime(iso: string): number[] | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
  } catch {
    return null;
  }
}

function parseDateOnly(iso: string): number[] | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  } catch {
    return null;
  }
}
