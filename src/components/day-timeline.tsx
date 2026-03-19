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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold text-sm">{formattedDate}</h4>
        {cityName && <span className="text-xs text-muted-foreground">· {cityName}</span>}
      </div>
      {day.daySummary && (
        <p className="text-xs text-muted-foreground">{day.daySummary}</p>
      )}
      {day.activities.length === 0 && (
        <p className="text-xs text-muted-foreground italic pl-4">No activities yet</p>
      )}
      <div className="space-y-2 pl-4 border-l-2 border-border">
        {day.activities.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  );
}
