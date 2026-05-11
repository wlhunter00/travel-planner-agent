import type { TripState, Activity } from "@/lib/types";
import {
  normalizeActivityType,
  sanitizePhotoUrl,
  ACTIVITY_META,
} from "@/lib/activity-meta";

function sanitizeActivity(raw: Activity): Activity {
  const type = normalizeActivityType((raw as { type?: unknown }).type ?? raw.type);
  let title = typeof raw.title === "string" ? raw.title.trim() : "";
  const metaFallback = ACTIVITY_META[type]?.fallbackTitle ?? "Stop";
  if (title.length < 2) title = metaFallback;

  const photoUrlRaw = typeof raw.photoUrl === "string" ? raw.photoUrl : undefined;
  const sanitizedPhoto = sanitizePhotoUrl(photoUrlRaw);

  const sourceCitations = Array.isArray(raw.sourceCitations)
    ? raw.sourceCitations
        .filter(
          (
            c
          ): c is { label: string; url: string } =>
            c != null &&
            typeof (c as { label?: unknown }).label === "string" &&
            typeof (c as { url?: unknown }).url === "string"
        )
        .map((c) => ({
          label: c.label.trim(),
          url: c.url.trim(),
        }))
    : undefined;

  return {
    ...raw,
    type,
    title,
    photoUrl: sanitizedPhoto ?? photoUrlRaw,
    sourceCitations:
      sourceCitations && sourceCitations.length > 0 ? sourceCitations : undefined,
  };
}

/**
 * Normalize activities when merging partial TripState from agent `update_trip`.
 */
export function sanitizePartialTripState(partial: Partial<TripState>): Partial<TripState> {
  const out: Partial<TripState> = { ...partial };

  if (Array.isArray(partial.hotels)) {
    out.hotels = partial.hotels.map((h) => ({
      ...h,
      photoUrl: sanitizePhotoUrl(h.photoUrl) ?? h.photoUrl,
    }));
  }

  if (!Array.isArray(partial.days)) return out;

  return {
    ...out,
    days: partial.days.map((day) => {
      const activities = Array.isArray(day.activities) ? day.activities : [];
      return {
        ...day,
        activities: activities.map((a) =>
          sanitizeActivity({ ...(a as Activity) }),
        ),
      };
    }),
  };
}
