import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".travel-planner");
const PREFS_PATH = path.join(DATA_DIR, "preferences.json");

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

export async function getPreferences(): Promise<UserPreferences | null> {
  try {
    const data = await fs.readFile(PREFS_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  prefs.lastUpdated = new Date().toISOString();
  await fs.writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2));
}

export async function updatePreferences(
  updates: Partial<UserPreferences>
): Promise<UserPreferences> {
  const existing = (await getPreferences()) || emptyPreferences();

  for (const [key, value] of Object.entries(updates)) {
    if (key === "lastUpdated") continue;
    const rec = existing as unknown as Record<string, unknown>;
    if (Array.isArray(value) && Array.isArray(rec[key])) {
      const existingArr = rec[key] as string[];
      rec[key] = [...new Set([...existingArr, ...value])];
    } else if (value !== undefined) {
      rec[key] = value;
    }
  }

  await savePreferences(existing);
  return existing;
}
