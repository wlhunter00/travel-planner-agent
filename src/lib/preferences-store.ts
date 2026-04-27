import { prisma } from "./prisma";
import {
  emptyPreferences,
  type UserPreferences,
  type PastTrip,
} from "./preferences-types";

export { emptyPreferences };
export type { UserPreferences, PastTrip };

export async function getPreferences(userId: string): Promise<UserPreferences | null> {
  const row = await prisma.preferences.findUnique({ where: { userId } });
  if (!row) return null;
  return row.data as unknown as UserPreferences;
}

export async function savePreferences(
  userId: string,
  prefs: UserPreferences,
): Promise<void> {
  prefs.lastUpdated = new Date().toISOString();
  await prisma.preferences.upsert({
    where: { userId },
    update: { data: prefs as unknown as object },
    create: { userId, data: prefs as unknown as object },
  });
}

export async function updatePreferences(
  userId: string,
  updates: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const existing = (await getPreferences(userId)) ?? emptyPreferences();

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

  await savePreferences(userId, existing);
  return existing;
}
