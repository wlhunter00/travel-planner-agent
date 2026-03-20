"use client";

import { useTripStore } from "@/lib/store";
import { PhaseIndicator } from "./phase-indicator";
import { TripHeader } from "./trip-header";
import { FlightCard } from "./flight-card";
import { HotelCard } from "./hotel-card";
import { DayTimeline } from "./day-timeline";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Download, FileText, Calendar } from "lucide-react";

export function TripView() {
  const trip = useTripStore((s) => s.trip);

  if (!trip) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const { state } = trip;
  const hasFlights = state.flights.length > 0;
  const hasCities = state.cities.length > 0;
  const hasHotels = state.hotels.length > 0;
  const hasDays = state.days.length > 0;
  const hasContent = hasFlights || hasCities || hasHotels || hasDays;

  const cityMap = Object.fromEntries(state.cities.map((c) => [c.id, c.name]));

  return (
    <div className="h-full flex flex-col bg-background">
      <PhaseIndicator currentPhase={trip.phase} />
      <ScrollArea className="flex-1">
        <div>
          <TripHeader />

          {!hasContent && (
            <div className="px-6 py-12 text-center text-muted-foreground animate-fade-up">
              <div className="text-5xl mb-4 opacity-60">🗺️</div>
              <p className="font-serif text-lg text-foreground/70">Your itinerary will appear here</p>
              <p className="text-xs mt-1.5 text-muted-foreground/60">Start by telling the agent where you want to go.</p>
            </div>
          )}

          {hasFlights && (
            <section className="p-5">
              <h3 className="text-[11px] font-semibold mb-3 text-muted-foreground/60 uppercase tracking-widest">
                Flights
              </h3>
              <div className="space-y-2.5">
                {state.flights.map((f) => (
                  <FlightCard key={f.id} flight={f} />
                ))}
              </div>
            </section>
          )}

          {hasCities && (
            <section className="p-5 border-t border-border/40">
              <h3 className="text-[11px] font-semibold mb-3 text-muted-foreground/60 uppercase tracking-widest">
                Route
              </h3>
              <div className="flex flex-wrap gap-2">
                {state.cities.map((city, i) => (
                  <div key={city.id} className="flex items-center gap-2">
                    <div className="bg-primary/8 border border-primary/10 rounded-lg px-3.5 py-2 transition-colors hover:bg-primary/12">
                      <p className="font-medium text-sm">{city.name}</p>
                      <p className="text-xs text-muted-foreground/70">{city.days} day{city.days > 1 ? "s" : ""}</p>
                    </div>
                    {i < state.cities.length - 1 && (
                      <span className="text-muted-foreground/40 text-lg">→</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasHotels && (
            <section className="p-5 border-t border-border/40">
              <h3 className="text-[11px] font-semibold mb-3 text-muted-foreground/60 uppercase tracking-widest">
                Accommodations
              </h3>
              <div className="grid grid-cols-1 gap-2.5">
                {state.hotels.map((h) => (
                  <HotelCard key={h.id} hotel={h} />
                ))}
              </div>
            </section>
          )}

          {hasDays && (
            <section className="p-5 border-t border-border/40">
              <h3 className="text-[11px] font-semibold mb-4 text-muted-foreground/60 uppercase tracking-widest">
                Day Plans
              </h3>
              <div className="space-y-7">
                {state.days.map((day) => (
                  <DayTimeline key={day.id} day={day} cityName={cityMap[day.cityId]} />
                ))}
              </div>
            </section>
          )}

          {hasContent && (
            <section className="p-5 border-t border-border/40">
              <h3 className="text-[11px] font-semibold mb-3 text-muted-foreground/60 uppercase tracking-widest">
                Export
              </h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/api/export?tripId=${trip.id}&format=json`)}
                  className="gap-1.5 text-xs border-border/60"
                >
                  <FileText className="size-3" />
                  JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/api/export?tripId=${trip.id}&format=csv`)}
                  className="gap-1.5 text-xs border-border/60"
                >
                  <Download className="size-3" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/api/export?tripId=${trip.id}&format=ical`)}
                  className="gap-1.5 text-xs border-border/60"
                >
                  <Calendar className="size-3" />
                  iCal
                </Button>
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
