import type { Activity, Recommendation } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import {
  UtensilsCrossed,
  Camera,
  Mountain,
  Footprints,
  Sparkles,
  TrainFront,
} from "lucide-react";

/** Matches Friend Recommendations `CATEGORY_STYLE` tokens — activity types align to rec categories visually. */
export const ACTIVITY_TYPE_STYLE: Record<Activity["type"], string> = {
  poi: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  meal: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  tour: "bg-green-500/10 text-green-600 dark:text-green-400",
  travel: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  free_time: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  experience: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
};

/** Accent dots for timeline connector */
export const ACTIVITY_DOT_CLASS: Record<Activity["type"], string> = {
  poi: "bg-purple-500",
  meal: "bg-orange-500",
  tour: "bg-green-500",
  travel: "bg-gray-400",
  free_time: "bg-amber-500",
  experience: "bg-teal-500",
};

export const ACTIVITY_META: Record<
  Activity["type"],
  { fallbackTitle: string; icon: LucideIcon }
> = {
  poi: { fallbackTitle: "Sightseeing stop", icon: Camera },
  meal: { fallbackTitle: "Meal stop", icon: UtensilsCrossed },
  tour: { fallbackTitle: "Tour stop", icon: Footprints },
  travel: { fallbackTitle: "Transit", icon: TrainFront },
  free_time: { fallbackTitle: "Free time", icon: Sparkles },
  experience: { fallbackTitle: "Experience", icon: Mountain },
};

const TYPE_ALIASES: Record<string, Activity["type"]> = {
  sightseeing: "poi",
  viewpoint: "poi",
  attraction: "poi",
  museum: "poi",
  landmark: "poi",
  beach: "poi",
  hotel: "poi",
  sight: "poi",
  restaurant: "meal",
  dinner: "meal",
  lunch: "meal",
  breakfast: "meal",
  cafe: "meal",
  poi: "poi",
  tour: "tour",
  travel: "travel",
  transit: "travel",
  freetime: "free_time",
  experience: "experience",
  excursion: "experience",
  flight: "travel",
  train: "travel",
  transfer: "travel",
  walk: "tour",
  hike: "tour",
};

export function normalizeActivityType(raw: unknown): Activity["type"] {
  if (raw == null) return "poi";
  const t = String(raw).toLowerCase().trim();
  if (!t) return "poi";
  if (Object.prototype.hasOwnProperty.call(ACTIVITY_META, t)) {
    return t as Activity["type"];
  }
  return TYPE_ALIASES[t] ?? "poi";
}

const normTitle = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

export function resolveRecommenders(activity: Activity, recs: Recommendation[]): string[] {
  const title = activity.title?.trim();
  if (!title) return [];
  const t = normTitle(title);
  const out = new Set<string>();
  for (const rec of recs) {
    const who = rec.recommender?.trim();
    if (!who || rec.status !== "ready") continue;
    const hit = rec.extractedItems.some((i) => {
      const n = normTitle(i.name);
      return n === t || n.includes(t) || t.includes(n);
    });
    if (hit) out.add(who);
  }
  return [...out];
}

/** Rewrite Google Places media URLs that expose API keys to use the local proxy route. */
export function sanitizePhotoUrl(url: string | undefined | null): string | undefined {
  if (url == null || typeof url !== "string") return undefined;
  const u = url.trim();
  if (!u) return undefined;
  if (u.includes("/api/places/photo")) return u;

  const m = u.match(/^https:\/\/places\.googleapis\.com\/v1\/(.+)\/media(?:\?|$)/i);
  if (m?.[1]) {
    let w = "400";
    try {
      const parsed = new URL(u);
      w = parsed.searchParams.get("maxHeightPx") ?? parsed.searchParams.get("w") ?? "400";
    } catch {
      // keep default w
    }
    return `/api/places/photo?name=${encodeURIComponent(m[1])}&w=${encodeURIComponent(w)}`;
  }

  return u;
}
