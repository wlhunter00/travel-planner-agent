"use client";

import { useTripStore } from "@/lib/store";
import { PhaseIndicator } from "./phase-indicator";
import { TripHeader } from "./trip-header";
import { FlightCard } from "./flight-card";
import { HotelCard } from "./hotel-card";
import { DayTimeline } from "./day-timeline";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

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
    <div className="h-full flex flex-col">
      <PhaseIndicator currentPhase={trip.phase} />
      <ScrollArea className="flex-1">
        <div className="p-0">
          <TripHeader />

          {!hasContent && (
            <div className="p-6 text-center text-muted-foreground">
              <div className="text-5xl mb-3">🗺️</div>
              <p className="text-sm">Your itinerary will appear here as you plan.</p>
              <p className="text-xs mt-1">Start by telling the agent where you want to go.</p>
            </div>
          )}

          {hasFlights && (
            <section className="p-4">
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Flights</h3>
              <div className="space-y-2">
                {state.flights.map((f) => (
                  <FlightCard key={f.id} flight={f} />
                ))}
              </div>
            </section>
          )}

          {hasCities && (
            <>
              <Separator />
              <section className="p-4">
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Route</h3>
                <div className="flex flex-wrap gap-2">
                  {state.cities.map((city, i) => (
                    <div key={city.id} className="flex items-center gap-2">
                      <div className="bg-primary/10 rounded-lg px-3 py-1.5">
                        <p className="font-medium text-sm">{city.name}</p>
                        <p className="text-xs text-muted-foreground">{city.days} day{city.days > 1 ? "s" : ""}</p>
                      </div>
                      {i < state.cities.length - 1 && <span className="text-muted-foreground">→</span>}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {hasHotels && (
            <>
              <Separator />
              <section className="p-4">
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Hotels</h3>
                <div className="grid grid-cols-1 gap-2">
                  {state.hotels.map((h) => (
                    <HotelCard key={h.id} hotel={h} />
                  ))}
                </div>
              </section>
            </>
          )}

          {hasDays && (
            <>
              <Separator />
              <section className="p-4">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Day Plans</h3>
                <div className="space-y-6">
                  {state.days.map((day) => (
                    <DayTimeline key={day.id} day={day} cityName={cityMap[day.cityId]} />
                  ))}
                </div>
              </section>
            </>
          )}

          {hasContent && (
            <>
              <Separator />
              <section className="p-4">
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Export</h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/api/export?tripId=${trip.id}&format=json`)}
                  >
                    JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/api/export?tripId=${trip.id}&format=csv`)}
                  >
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/api/export?tripId=${trip.id}&format=ical`)}
                  >
                    iCal
                  </Button>
                </div>
              </section>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
