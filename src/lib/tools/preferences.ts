import {
  getPreferences,
  updatePreferences,
  savePreferences,
} from "../preferences-store";
import { emptyPreferences, type UserPreferences, type PastTrip } from "../preferences-types";

export async function getPreferencesTool(
  userId: string,
): Promise<{ preferences: UserPreferences }> {
  const prefs = await getPreferences(userId);
  return { preferences: prefs ?? emptyPreferences() };
}

export async function updatePreferencesTool(
  userId: string,
  params: {
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
  },
): Promise<{ success: boolean; preferences: UserPreferences }> {
  const updated = await updatePreferences(userId, params);
  return { success: true, preferences: updated };
}

export async function saveTripSummaryTool(
  userId: string,
  params: {
    destination: string;
    dates: string;
    loved: string[];
    wouldSkip: string[];
  },
): Promise<{ success: boolean }> {
  const prefs = (await getPreferences(userId)) ?? emptyPreferences();

  const summary: PastTrip = {
    destination: params.destination,
    dates: params.dates,
    loved: params.loved,
    wouldSkip: params.wouldSkip,
  };

  prefs.pastTrips.push(summary);
  await savePreferences(userId, prefs);

  return { success: true };
}
