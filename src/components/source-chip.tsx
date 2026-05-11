"use client";

import type { Activity, Recommendation } from "@/lib/types";
import { User, Sparkles, Bookmark } from "lucide-react";
import { resolveRecommenders } from "@/lib/activity-meta";

type SourceChipProps = {
  activity: Activity;
  recommendations: Recommendation[];
};

export function SourceChip({ activity, recommendations }: SourceChipProps) {
  const src = activity.recommendationSource;
  if (!src) return null;

  const resolved = resolveRecommenders(activity, recommendations);
  const hasMultipleRecs =
    src === "friend_recommendation" && resolved.length > 1;

  const base =
    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium";

  if (src === "friend_recommendation") {
    if (hasMultipleRecs) {
      const label =
        resolved.length === 2
          ? `${resolved[0]} + ${resolved[1]}`
          : `${resolved[0]} + ${resolved.length - 1}`;
      return (
        <span
          className={`${base} bg-purple-500/15 text-purple-600 dark:text-purple-400`}
          title={resolved.join(", ")}
        >
          <User className="size-2.5 shrink-0" />
          {label}
        </span>
      );
    }
    const single = resolved[0];
    const who = single ?? "Friend tip";
    return (
      <span
        className={`${base} bg-green-500/10 text-green-600 dark:text-green-400`}
        title={single ? `${single}'s recommendation` : undefined}
      >
        <User className="size-2.5 shrink-0" />
        {who}
      </span>
    );
  }

  if (src === "agent_research") {
    const n = activity.sourceCitations?.length ?? 0;
    return (
      <span
        className={`${base} bg-blue-500/10 text-blue-600 dark:text-blue-400`}
        title={n > 0 ? `${n} source${n === 1 ? "" : "s"}` : undefined}
      >
        <Sparkles className="size-2.5 shrink-0" />
        Researched{n > 0 ? ` · ${n}` : ""}
      </span>
    );
  }

  if (src === "user_choice") {
    return (
      <span
        className={`${base} bg-amber-500/10 text-amber-600 dark:text-amber-400`}
      >
        <Bookmark className="size-2.5 shrink-0" />
        You picked
      </span>
    );
  }

  return null;
}

type CitationsFooterProps = {
  citations: NonNullable<Activity["sourceCitations"]>;
};

function hostname(label: string, url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h || label;
  } catch {
    return label;
  }
}

export function CitationsFooter({ citations }: CitationsFooterProps) {
  if (citations.length === 0) return null;

  return (
    <p className="text-[10px] text-muted-foreground/60 mt-1 leading-relaxed">
      <span className="mr-1">Via</span>
      {citations.map((c, i) => (
        <span key={`${c.url}-${i}`}>
          {i > 0 && ", "}
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/50 hover:text-primary transition-colors underline-offset-2 hover:underline"
          >
            {hostname(c.label, c.url)}
          </a>
        </span>
      ))}
    </p>
  );
}
