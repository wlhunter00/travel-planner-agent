"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { TruncatedNotes } from "@/components/truncated-notes";
import { SourceChip, CitationsFooter } from "@/components/source-chip";
import type { Activity } from "@/lib/types";
import { useTripStore } from "@/lib/store";
import {
  ACTIVITY_META,
  ACTIVITY_TYPE_STYLE,
  normalizeActivityType,
} from "@/lib/activity-meta";

interface ActivityCardProps {
  activity: Activity;
  staggerClass?: string;
}

export function ActivityCard({ activity, staggerClass = "" }: ActivityCardProps) {
  const recommendations = useTripStore((s) => s.trip?.recommendations ?? []);
  const resolvedType = normalizeActivityType(activity.type);
  const meta = ACTIVITY_META[resolvedType];
  const Icon = meta.icon;

  const title =
    activity.title?.trim().length >= 2
      ? activity.title.trim()
      : meta.fallbackTitle;

  const style = ACTIVITY_TYPE_STYLE[resolvedType];
  const isShortNote =
    activity.notes && activity.notes.length > 0 && activity.notes.length <= 60;

  const currencySym =
    activity.currency === "USD" || !activity.currency ? "$" : activity.currency;

  return (
    <div
      className={`group/item flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/40 animate-fade-up ${staggerClass}`}
    >
      <div className={`mt-0.5 rounded-md p-1.5 ${style}`}>
        <Icon className="size-3" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium">{title}</span>
          {activity.startTime && (
            <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
              {activity.startTime}
            </span>
          )}
          {activity.duration && (
            <span className="text-[10px] text-muted-foreground">
              {activity.duration}
            </span>
          )}
          {activity.rating != null && (
            <span className="text-[10px] text-muted-foreground font-medium">
              {activity.rating}★
            </span>
          )}
          {typeof activity.price === "number" &&
            activity.price > 0 && (
              <span className="text-[10px] text-muted-foreground font-medium">
                {currencySym}
                {activity.price}
              </span>
            )}
          {isShortNote && (
            <span className="text-[10px] text-muted-foreground">
              {activity.notes}
            </span>
          )}
          <SourceChip activity={activity} recommendations={recommendations} />
        </div>

        {activity.address && (
          <p className="text-xs text-muted-foreground mt-0.5">
            <MapPin className="size-3 inline mr-0.5 -mt-0.5" aria-hidden />
            {activity.address}
          </p>
        )}

        {activity.notes && !isShortNote && (
          <TruncatedNotes text={activity.notes} />
        )}

        {activity.bookingUrl && (
          <a
            href={activity.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary transition-colors mt-1"
          >
            <ExternalLink className="size-2.5" aria-hidden />
            Book
          </a>
        )}

        {activity.sourceCitations && activity.sourceCitations.length > 0 && (
          <CitationsFooter citations={activity.sourceCitations} />
        )}
      </div>
    </div>
  );
}
