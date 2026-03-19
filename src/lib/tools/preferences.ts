import { getPreferences, updatePreferences, savePreferences, emptyPreferences } from "../preferences-store";
import type { UserPreferences, PastTrip } from "../preferences-store";

export async function getPreferencesTool(): Promise<{ preferences: UserPreferences }> {
  const prefs = await getPreferences();
  return { preferences: prefs || emptyPreferences() };
}

export async function updatePreferencesTool(params: {
  travelStyle?: string[];
  accommodationStyle?: string[];
  cuisinePreferences?: string[];
  dietaryRestrictions?: string[];
  activityInterests?: string[];
  transportPreference?: string[];
  avoids?: string[];
  airlinePreferences?: string[];
  budgetRange?: string;
  splurgeCategories?: string[];
  saveCategories?: string[];
}): Promise<{ success: boolean; preferences: UserPreferences }> {
  const updated = await updatePreferences(params);
  return { success: true, preferences: updated };
}

export async function saveTripSummaryTool(params: {
  destination: string;
  dates: string;
  loved: string[];
  wouldSkip: string[];
}): Promise<{ success: boolean }> {
  const prefs = await getPreferences() || emptyPreferences();

  const summary: PastTrip = {
    destination: params.destination,
    dates: params.dates,
    loved: params.loved,
    wouldSkip: params.wouldSkip,
  };

  prefs.pastTrips.push(summary);
  await savePreferences(prefs);

  return { success: true };
}
