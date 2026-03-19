"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Flight } from "@/lib/types";

export function FlightCard({ flight }: { flight: Flight }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">✈️</span>
          <div>
            <p className="font-medium text-sm">{flight.airline}{flight.flightNumber ? ` ${flight.flightNumber}` : ""}</p>
            <p className="text-xs text-muted-foreground">{flight.cabinClass || "Economy"}</p>
          </div>
        </div>
        {flight.price && (
          <span className="text-lg font-bold">
            {flight.currency === "USD" ? "$" : flight.currency || "$"}{flight.price}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 mt-3">
        <div className="text-center">
          <p className="font-semibold text-sm">{formatTime(flight.departureTime)}</p>
          <p className="text-xs text-muted-foreground">{flight.origin}</p>
        </div>
        <div className="flex-1 flex flex-col items-center gap-0.5">
          <p className="text-xs text-muted-foreground">{flight.duration}</p>
          <div className="w-full flex items-center gap-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs">→</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {flight.stops > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {flight.stops} stop{flight.stops > 1 ? "s" : ""}
            </Badge>
          )}
          {flight.stops === 0 && (
            <Badge variant="outline" className="text-[10px]">Nonstop</Badge>
          )}
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm">{formatTime(flight.arrivalTime)}</p>
          <p className="text-xs text-muted-foreground">{flight.destination}</p>
        </div>
      </div>

      {flight.bookingUrl && (
        <a
          href={flight.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-3 text-center text-xs text-primary hover:underline"
        >
          View on Kiwi.com →
        </a>
      )}
    </Card>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}
