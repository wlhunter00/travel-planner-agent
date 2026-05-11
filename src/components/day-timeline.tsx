"use client";

import type { Activity, DayPlan } from "@/lib/types";
import { Sunrise, Sun, Moon, Compass } from "lucide-react";
import { ActivityCard } from "./activity-card";
import {
  ACTIVITY_DOT_CLASS,
  normalizeActivityType,
} from "@/lib/activity-meta";

const STAGGER = [
  "stagger-1",
  "stagger-2",
  "stagger-3",
  "stagger-4",
  "stagger-5",
  "stagger-6",
] as const;

type Bucket = "morning" | "afternoon" | "evening" | "unknown";

function timeBucket(startTime?: string): Bucket {
  if (!startTime?.trim()) return "unknown";
  const m = startTime.trim().match(/^(\d{1,2})/);
  if (!m) return "unknown";
  const h = parseInt(m[1], 10);
  if (Number.isNaN(h)) return "unknown";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const GROUP_META: Record<
  Exclude<Bucket, "unknown">,
  { label: string; icon: typeof Sunrise }
> = {
  morning: { label: "MORNING", icon: Sunrise },
  afternoon: { label: "AFTERNOON", icon: Sun },
  evening: { label: "EVENING", icon: Moon },
};

interface DayTimelineProps {
  day: DayPlan;
  cityName?: string;
  dayIndex: number;
}

type GroupRow =
  | {
      kind: "bucket";
      key: Exclude<Bucket, "unknown">;
      activities: Activity[];
    }
  | { kind: "unknown"; activities: Activity[] };

export function DayTimeline({ day, cityName, dayIndex }: DayTimelineProps) {
  const formattedDate = day.date
    ? new Date(day.date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "TBD";

  const cityUpper = cityName?.toUpperCase() ?? "";
  const dayLabel = `DAY ${String(dayIndex + 1).padStart(2, "0")}${
    cityUpper ? ` · ${cityUpper}` : ""
  }`;

  const buckets: Record<Exclude<Bucket, "unknown">, Activity[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  const unknown: Activity[] = [];

  for (const a of day.activities) {
    const b = timeBucket(a.startTime);
    if (b === "unknown") unknown.push(a);
    else buckets[b].push(a);
  }

  const groups: GroupRow[] = [];
  for (const key of ["morning", "afternoon", "evening"] as const) {
    if (buckets[key].length > 0) {
      groups.push({ kind: "bucket", key, activities: buckets[key] });
    }
  }
  if (unknown.length > 0) {
    groups.push({ kind: "unknown", activities: unknown });
  }

  let globalIdx = 0;
  const dayStagger = STAGGER[Math.min(dayIndex % 6, 5)];

  return (
    <div className={`space-y-6 animate-fade-up ${dayStagger}`}>
      <header className="space-y-2">
        <p className="text-[10px] font-semibold text-warm-amber/70 uppercase tracking-widest">
          {dayLabel}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h4 className="font-serif text-2xl text-foreground leading-tight tracking-tight">
            {formattedDate}
          </h4>
          <span className="font-mono text-[10px] text-muted-foreground/40 hidden sm:inline">
            · · ·
          </span>
        </div>
        {day.daySummary && (
          <blockquote className="border-l-2 border-warm-gold/40 pl-3 font-serif italic text-sm text-foreground/80 leading-relaxed">
            {day.daySummary}
          </blockquote>
        )}
        <div className="h-px bg-border/50 max-w-md" aria-hidden />
      </header>

      {day.activities.length === 0 && (
        <p className="text-xs text-muted-foreground/50 italic pl-15">
          No activities yet
        </p>
      )}

      {groups.map((g) => {
        const isBucket = g.kind === "bucket";
        const meta = isBucket ? GROUP_META[g.key] : null;
        const Icon = meta?.icon ?? Compass;
        const label = meta?.label ?? "YOUR STOPS";

        return (
          <div key={isBucket ? g.key : "open"} className="space-y-2">
            <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 items-start">
              <div className="flex flex-col items-end gap-1 pr-2 border-r border-border/50 pb-1">
                <Icon
                  className="size-3.5 text-muted-foreground/60 shrink-0"
                  aria-hidden
                />
                <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-right leading-tight max-w-[52px]">
                  {label}
                </span>
              </div>
              <div className="min-h-4" aria-hidden />
            </div>

            {g.activities.map((activity) => {
              const t = normalizeActivityType(activity.type);
              const dot = ACTIVITY_DOT_CLASS[t];
              const stagger = STAGGER[globalIdx % 6];
              globalIdx += 1;

              return (
                <div
                  key={activity.id}
                  className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 items-start"
                >
                  <div className="flex flex-col items-center gap-1 pt-2 border-r border-border/50 min-h-10">
                    <span
                      className={`size-1.5 rounded-full shrink-0 ring-2 ring-background ${dot}`}
                      aria-hidden
                    />
                    {activity.startTime && (
                      <span className="font-mono text-[9px] text-muted-foreground/70 tabular-nums text-center max-w-[48px] leading-tight px-0.5">
                        {activity.startTime}
                      </span>
                    )}
                  </div>
                  <ActivityCard activity={activity} staggerClass={stagger} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
