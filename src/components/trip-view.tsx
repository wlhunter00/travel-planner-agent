"use client";

import { useState } from "react";
import { useTripStore } from "@/lib/store";
import { PhaseIndicator } from "./phase-indicator";
import { TripHeader } from "./trip-header";
import { FlightCard } from "./flight-card";
import { HotelCard } from "./hotel-card";
import { DayTimeline } from "./day-timeline";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Download, FileText, Calendar, Sparkles, MapPin, UtensilsCrossed, Building2, Compass, LayoutGrid, Train, StickyNote, ExternalLink, Link, MessageSquare, X, User, Trash2, ChevronDown } from "lucide-react";
import type { Recommendation, RecommendationCategory, ExtractedItem, SkeletonDay, ConfirmedHotel } from "@/lib/types";

function CollapsibleSection({
  title,
  icon: Icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: typeof MapPin;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-border/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between p-5 group/collapse ${open ? "pb-0" : ""}`}
      >
        <h3 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1.5">
          <Icon className="size-3" />
          {title}
          {badge && (
            <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground/50">
              {badge}
            </span>
          )}
        </h3>
        <ChevronDown
          className={`size-3.5 text-muted-foreground/40 transition-transform group-hover/collapse:text-muted-foreground/60 ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && <div className="p-5 pt-3">{children}</div>}
    </section>
  );
}

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
  const allRecs = trip.recommendations || [];
  const readyRecs = allRecs.filter((r) => r.status === "ready");
  const hasRecs = allRecs.length > 0;

  const hasRoute = !!state.route && state.route.order.length > 0;
  const hasSkeleton = !!state.itinerarySkeleton && state.itinerarySkeleton.length > 0;
  const hasLodging = !!state.lodging?.confirmedHotels && Object.keys(state.lodging.confirmedHotels).length > 0;
  const hasNotes = !!state.notes;
  const hasPlanningData = hasRoute || hasSkeleton || hasLodging || hasNotes;
  const hasContent = hasFlights || hasCities || hasHotels || hasDays || hasPlanningData;

  const cityMap = Object.fromEntries(state.cities.map((c) => [c.id, c.name]));

  return (
    <div className="h-full flex flex-col bg-background">
      <PhaseIndicator currentPhase={trip.phase} />
      <ScrollArea className="flex-1">
        <div>
          <TripHeader />

          {!hasContent && !hasRecs && (
            <div className="px-6 py-12 text-center text-muted-foreground animate-fade-up">
              <div className="text-5xl mb-4 opacity-60">🗺️</div>
              <p className="font-serif text-lg text-foreground/70">Your itinerary will appear here</p>
              <p className="text-xs mt-1.5 text-muted-foreground/60">Start by telling the agent where you want to go.</p>
              <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/50">
                <Sparkles className="size-3" />
                <span>Have tips from friends? Click <strong className="text-muted-foreground/70">Recs</strong> in the chat panel to add them.</span>
              </div>
            </div>
          )}

          {hasNotes && (
            <CollapsibleSection title="Notes" icon={StickyNote}>
              <p className="text-sm text-foreground/80 leading-relaxed">{state.notes}</p>
            </CollapsibleSection>
          )}

          {hasRoute && !hasCities && (
            <RouteOverview
              order={state.route!.order}
              transfer={state.route!.transfer}
              timings={state.route!.timings}
            />
          )}

          {hasSkeleton && !hasDays && (
            <ItinerarySkeletonSection days={state.itinerarySkeleton!} />
          )}

          {hasLodging && !hasHotels && (
            <ConfirmedLodgingSection hotels={state.lodging!.confirmedHotels!} />
          )}

          {hasFlights && (
            <CollapsibleSection title="Flights" icon={MapPin}>
              <div className="space-y-2.5">
                {state.flights.map((f) => (
                  <FlightCard key={f.id} flight={f} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {hasCities && (
            <CollapsibleSection title="Route" icon={Train}>
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
            </CollapsibleSection>
          )}

          {hasHotels && (
            <CollapsibleSection title="Accommodations" icon={Building2}>
              <div className="grid grid-cols-1 gap-2.5">
                {state.hotels.map((h) => (
                  <HotelCard key={h.id} hotel={h} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {hasDays && (
            <CollapsibleSection title="Day Plans" icon={Calendar}>
              <div className="space-y-7">
                {state.days.map((day) => (
                  <DayTimeline key={day.id} day={day} cityName={cityMap[day.cityId]} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {hasRecs && (
            <RecommendationsSection recs={allRecs} tripId={trip.id} />
          )}

          {hasContent && (
            <CollapsibleSection title="Export" icon={Download}>
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
            </CollapsibleSection>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function RouteOverview({
  order,
  transfer,
  timings,
}: {
  order: string[];
  transfer?: string;
  timings?: Record<string, string>;
}) {
  return (
    <CollapsibleSection title="Route" icon={Train}>
      <div className="flex flex-wrap items-center gap-2">
        {order.map((city, i) => (
          <div key={city} className="flex items-center gap-2">
            <div className="bg-primary/8 border border-primary/10 rounded-lg px-3.5 py-2 transition-colors hover:bg-primary/12">
              <p className="font-medium text-sm">{city}</p>
            </div>
            {i < order.length - 1 && (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-muted-foreground/40 text-lg">→</span>
                {transfer && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <Train className="size-2.5" />
                    {transfer}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {timings && Object.keys(timings).length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(timings).map(([route, time]) => (
            <span key={route} className="text-[11px] text-muted-foreground/60">
              {route.replace(/_/g, " ")}: {time}
            </span>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

function ItinerarySkeletonSection({ days }: { days: SkeletonDay[] }) {
  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso + "T00:00:00");
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <CollapsibleSection title="Itinerary Overview" icon={Calendar}>
      <div className="space-y-0">
        {days.map((day, i) => (
          <div key={day.date} className="flex gap-3 group">
            <div className="flex flex-col items-center">
              <div className="size-2 rounded-full bg-primary/40 ring-2 ring-primary/10 mt-1.5 shrink-0" />
              {i < days.length - 1 && <div className="w-px flex-1 bg-border/60 my-1" />}
            </div>
            <div className="pb-4 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-foreground/80">{formatDate(day.date)}</span>
                <span className="text-[11px] text-primary/60 font-medium">{day.city}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{day.plan}</p>
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function ConfirmedLodgingSection({ hotels }: { hotels: Record<string, ConfirmedHotel> }) {
  return (
    <CollapsibleSection title="Accommodations" icon={Building2}>
      <div className="grid grid-cols-1 gap-2.5">
        {Object.entries(hotels).map(([city, hotel]) => (
          <div
            key={city}
            className="rounded-lg border border-border/50 bg-muted/30 px-3.5 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{hotel.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <MapPin className="size-3 inline mr-1 -mt-0.5" />
                  {hotel.area} &middot; {city}
                </p>
              </div>
              {hotel.booking && (
                <a
                  href={hotel.booking}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-primary/60 hover:text-primary transition-colors"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

// ── Recommendation section components ──────────────────────────────────────

const CATEGORY_ICON: Record<RecommendationCategory, typeof MapPin> = {
  restaurant: UtensilsCrossed,
  hotel: Building2,
  attraction: MapPin,
  activity: Compass,
  neighborhood: LayoutGrid,
  general: Sparkles,
};

const CATEGORY_STYLE: Record<RecommendationCategory, string> = {
  restaurant: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  hotel: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  attraction: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  activity: "bg-green-500/10 text-green-600 dark:text-green-400",
  neighborhood: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  general: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

const CATEGORY_LABEL: Record<RecommendationCategory, string> = {
  restaurant: "Restaurants",
  hotel: "Hotels",
  attraction: "Attractions",
  activity: "Activities",
  neighborhood: "Neighborhoods",
  general: "General",
};

const SOURCE_ICON = {
  url: Link,
  text: MessageSquare,
  file: FileText,
} as const;

function TruncatedNotes({ text }: { text: string }) {
  const LIMIT = 100;
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LIMIT;

  return (
    <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
      {isLong && !expanded ? text.slice(0, LIMIT).trimEnd() + "…" : text}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-primary/60 hover:text-primary transition-colors"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </p>
  );
}

function RecommendationItem({
  item,
  onRemove,
}: {
  item: ExtractedItem;
  onRemove?: () => void;
}) {
  const Icon = CATEGORY_ICON[item.category] ?? Sparkles;
  const style = CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE.general;
  const isShortNote = item.notes && item.notes.length <= 60;

  return (
    <div className="group/item flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
      <div className={`mt-0.5 rounded-md p-1.5 ${style}`}>
        <Icon className="size-3" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium">{item.name}</span>
          {isShortNote && (
            <span className="text-[10px] text-muted-foreground">{item.notes}</span>
          )}
          {item.priceRange && (
            <span className="text-[10px] text-muted-foreground font-medium">{item.priceRange}</span>
          )}
        </div>
        {item.location && (
          <p className="text-xs text-muted-foreground mt-0.5">
            <MapPin className="size-3 inline mr-0.5 -mt-0.5" />
            {item.location}
          </p>
        )}
        {item.notes && !isShortNote && (
          <TruncatedNotes text={item.notes} />
        )}
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary transition-colors mt-1"
          >
            <ExternalLink className="size-2.5" />
            Source
          </a>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 mt-0.5 p-1 rounded opacity-0 group-hover/item:opacity-100 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
          title="Remove this item"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

interface TaggedItem {
  item: ExtractedItem;
  recId: string;
  itemIndex: number;
}

interface RecGroup {
  recommender: string;
  recs: Recommendation[];
  taggedItems: TaggedItem[];
}

function RecGroupCard({
  group,
  filteredItems,
  onRemoveRec,
  onRemoveItem,
  onRemoveGroup,
}: {
  group: RecGroup;
  filteredItems: TaggedItem[];
  onRemoveRec: (recId: string) => void;
  onRemoveItem: (recId: string, itemIndex: number) => void;
  onRemoveGroup: (recommender: string) => void;
}) {
  const hasName = group.recommender !== "_unnamed";
  const processingRecs = group.recs.filter((r) => r.status === "processing");
  const errorRecs = group.recs.filter((r) => r.status === "error");
  const emptyRecs = group.recs.filter((r) => r.status === "ready" && r.extractedItems.length === 0);
  const groupLabel = hasName ? `${group.recommender}'s picks` : "this group";

  return (
    <div className="space-y-2 group/group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {hasName && (
            <span className="flex items-center gap-1 text-xs font-medium text-foreground/80">
              <User className="size-3 text-primary/60" />
              {group.recommender}&apos;s picks
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/50">
            {group.taggedItems.length} item{group.taggedItems.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (
              group.taggedItems.length > 5 &&
              !confirm(`Delete all ${group.taggedItems.length} picks from ${groupLabel}? This cannot be undone.`)
            ) {
              return;
            }
            onRemoveGroup(group.recommender);
          }}
          className="opacity-0 group-hover/group:opacity-100 shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all"
          aria-label={`Delete all picks from ${groupLabel}`}
          title={`Delete all picks from ${groupLabel}`}
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {processingRecs.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Processing...
        </div>
      )}

      {errorRecs.map((rec) => (
        <div key={rec.id} className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive/80">
          <span className="flex-1">Failed to extract: {rec.error || "Unknown error"}</span>
          <button type="button" onClick={() => onRemoveRec(rec.id)} className="shrink-0 text-destructive/40 hover:text-destructive transition-colors">
            <X className="size-3" />
          </button>
        </div>
      ))}

      {emptyRecs.map((rec) => (
        <div key={rec.id} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
          <span className="flex-1">No places extracted from this source. Try pasting the name directly.</span>
          <button type="button" onClick={() => onRemoveRec(rec.id)} className="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors">
            <X className="size-3" />
          </button>
        </div>
      ))}

      {filteredItems.length > 0 && (
        <div className="space-y-1.5">
          {filteredItems.map((tagged) => (
            <RecommendationItem
              key={`${tagged.recId}-${tagged.itemIndex}`}
              item={tagged.item}
              onRemove={() => onRemoveItem(tagged.recId, tagged.itemIndex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function groupByRecommender(recs: Recommendation[]): RecGroup[] {
  const map = new Map<string, RecGroup>();
  for (const rec of recs) {
    const key = rec.recommender?.trim() || "_unnamed";
    let group = map.get(key);
    if (!group) {
      group = { recommender: key, recs: [], taggedItems: [] };
      map.set(key, group);
    }
    group.recs.push(rec);
    rec.extractedItems.forEach((item, i) => {
      group!.taggedItems.push({ item, recId: rec.id, itemIndex: i });
    });
  }
  return [...map.values()];
}

function RecommendationsSection({
  recs,
  tripId,
}: {
  recs: Recommendation[];
  tripId: string;
}) {
  const removeRecommendation = useTripStore((s) => s.removeRecommendation);
  const removeRecommendationGroup = useTripStore((s) => s.removeRecommendationGroup);
  const removeExtractedItem = useTripStore((s) => s.removeExtractedItem);
  const [activeFilter, setActiveFilter] = useState<RecommendationCategory | "all">("all");

  const groups = groupByRecommender(recs);

  const allCategories = [...new Set(
    recs.flatMap((r) => r.extractedItems.map((i) => i.category))
  )].sort();

  const totalItems = recs.reduce((n, r) => n + r.extractedItems.length, 0);

  async function handleRemoveRec(recId: string) {
    removeRecommendation(recId);
    await fetch(`/api/recommendations?tripId=${tripId}&id=${recId}`, {
      method: "DELETE",
    });
  }

  async function handleRemoveItem(recId: string, itemIndex: number) {
    removeExtractedItem(recId, itemIndex);
    await fetch(`/api/recommendations?tripId=${tripId}&id=${recId}&itemIndex=${itemIndex}`, {
      method: "DELETE",
    });
  }

  async function handleRemoveGroup(recommender: string) {
    removeRecommendationGroup(recommender);
    await fetch(
      `/api/recommendations?tripId=${tripId}&recommender=${encodeURIComponent(recommender)}`,
      { method: "DELETE" }
    );
  }

  const badge = totalItems > 0
    ? `${totalItems} item${totalItems !== 1 ? "s" : ""}`
    : `${recs.length} source${recs.length !== 1 ? "s" : ""}`;

  return (
    <CollapsibleSection title="Friend Recommendations" icon={Sparkles} badge={badge}>
      {allCategories.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
              activeFilter === "all"
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-muted/50 text-muted-foreground border border-border/50 hover:bg-muted"
            }`}
          >
            All
          </button>
          {allCategories.map((cat) => {
            const Icon = CATEGORY_ICON[cat] ?? Sparkles;
            const isActive = activeFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveFilter(isActive ? "all" : cat)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  isActive
                    ? `${CATEGORY_STYLE[cat]} border border-current/20`
                    : "bg-muted/50 text-muted-foreground border border-border/50 hover:bg-muted"
                }`}
              >
                <Icon className="size-2.5" />
                {CATEGORY_LABEL[cat]}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-5">
        {groups.map((group) => {
          const filtered = activeFilter === "all"
            ? group.taggedItems
            : group.taggedItems.filter((t) => t.item.category === activeFilter);
          const hasContent = filtered.length > 0 || group.recs.some(
            (r) => r.status !== "ready" || r.extractedItems.length === 0
          );
          if (!hasContent && activeFilter !== "all") return null;
          return (
            <RecGroupCard
              key={group.recommender}
              group={group}
              filteredItems={filtered}
              onRemoveRec={handleRemoveRec}
              onRemoveItem={handleRemoveItem}
              onRemoveGroup={handleRemoveGroup}
            />
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
