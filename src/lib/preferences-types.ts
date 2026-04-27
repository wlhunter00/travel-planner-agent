export interface UserPreferences {
  travelStyle: string[];
  accommodationStyle: string[];
  cuisinePreferences: string[];
  dietaryRestrictions: string[];
  activityInterests: string[];
  transportPreference: string[];
  avoids: string[];
  airlinePreferences: string[];
  budgetRange: string;
  splurgeCategories: string[];
  saveCategories: string[];
  pastTrips: PastTrip[];
  lastUpdated: string;
}

export interface PastTrip {
  destination: string;
  dates: string;
  loved: string[];
  wouldSkip: string[];
}

export function emptyPreferences(): UserPreferences {
  return {
    travelStyle: [],
    accommodationStyle: [],
    cuisinePreferences: [],
    dietaryRestrictions: [],
    activityInterests: [],
    transportPreference: [],
    avoids: [],
    airlinePreferences: [],
    budgetRange: "",
    splurgeCategories: [],
    saveCategories: [],
    pastTrips: [],
    lastUpdated: new Date().toISOString(),
  };
}
