"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Flight } from "@/lib/types";
import { Plane, ExternalLink } from "lucide-react";

export function FlightCard({ flight }: { flight: Flight }) {
  return (
    <Card className="p-4 border-border/50 transition-all duration-200 hover:border-border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/8">
            <Plane className="size-3.5 text-primary/70" />
          </div>
          <div>
            <p className="font-medium text-sm">{flight.airline}{flight.flightNumber ? ` ${flight.flightNumber}` : ""}</p>
            <p className="text-xs text-muted-foreground/70">{flight.cabinClass || "Economy"}</p>
          </div>
        </div>
        {flight.price && (
          <span className="font-serif text-xl text-foreground">
            {flight.currency === "USD" ? "$" : flight.currency || "$"}{flight.price}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 mt-4">
        <div className="text-center">
          <p className="font-semibold text-sm">{formatTime(flight.departureTime)}</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">{flight.origin}</p>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1">
          <p className="text-[11px] text-muted-foreground/60">{flight.duration}</p>
          <div className="w-full flex items-center gap-1.5">
            <div className="h-px flex-1 bg-border/60" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            <div className="h-px flex-1 bg-border/60" />
          </div>
          {flight.stops > 0 ? (
            <Badge variant="secondary" className="text-[10px] bg-warm-amber/10 text-warm-amber border-warm-amber/20">
              {flight.stops} stop{flight.stops > 1 ? "s" : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] border-warm-sage/20 text-warm-sage bg-warm-sage/8">
              Nonstop
            </Badge>
          )}
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm">{formatTime(flight.arrivalTime)}</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">{flight.destination}</p>
        </div>
      </div>

      {flight.bookingUrl && (
        <a
          href={flight.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 mt-3.5 text-xs text-primary/80 hover:text-primary transition-colors"
        >
          View on Kiwi.com
          <ExternalLink className="size-3" />
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
