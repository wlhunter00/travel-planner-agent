"use client";

import type { DayPlan } from "@/lib/types";
import { ActivityCard } from "./activity-card";

interface DayTimelineProps {
  day: DayPlan;
  cityName?: string;
}

export function DayTimeline({ day, cityName }: DayTimelineProps) {
  const formattedDate = day.date
    ? new Date(day.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "TBD";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h4 className="font-serif text-base text-foreground">{formattedDate}</h4>
        {cityName && (
          <span className="text-xs text-muted-foreground/50 font-medium uppercase tracking-wider">{cityName}</span>
        )}
      </div>
      {day.daySummary && (
        <p className="text-xs text-muted-foreground/70 leading-relaxed">{day.daySummary}</p>
      )}
      {day.activities.length === 0 && (
        <p className="text-xs text-muted-foreground/50 italic pl-4">No activities yet</p>
      )}
      <div className="space-y-2 pl-4 border-l-2 border-primary/15">
        {day.activities.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  );
}
