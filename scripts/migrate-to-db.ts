/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { config as loadEnv } from "dotenv";

// Load .env.local first (Vercel pull format), then fall back to .env
loadEnv({ path: ".env.local" });
loadEnv();

const prisma = new PrismaClient();
const TRIPS_DIR = path.join(process.cwd(), ".travel-planner", "trips");
const PREFS_PATH = path.join(process.cwd(), ".travel-planner", "preferences.json");

async function readJson<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim();
  if (!ownerEmail) {
    console.error("✗ Set OWNER_EMAIL env var to the email that should own the migrated data");
    console.error("  Example: OWNER_EMAIL=you@gmail.com npm run migrate:data");
    process.exit(1);
  }

  console.log(`Migrating local .travel-planner/ data to Postgres for ${ownerEmail}…`);

  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: { email: ownerEmail, name: "Owner" },
  });
  console.log(`✓ User: ${user.id} (${user.email})`);

  // ── Trips ─────────────────────────────────────────────────────────────
  let tripCount = 0;
  try {
    const entries = await fs.readdir(TRIPS_DIR);
    const tripFiles = entries.filter((f) => f.endsWith(".json") && f !== "index.json");

    for (const file of tripFiles) {
      const trip = await readJson<any>(path.join(TRIPS_DIR, file));
      if (!trip?.id) {
        console.warn(`  ⚠ Skipping ${file} (no id)`);
        continue;
      }

      const data = {
        userId: user.id,
        name: trip.name ?? "Untitled",
        status: trip.status ?? "planning",
        phase: trip.phase ?? "big_picture",
        destination: trip.destination ?? trip.state?.destination ?? "",
        startDate: trip.startDate ?? trip.state?.startDate ?? "",
        endDate: trip.endDate ?? trip.state?.endDate ?? "",
        coverImage: trip.coverImage ?? null,
        state: trip.state ?? {},
        chatHistory: trip.chatHistory ?? [],
        recommendations: trip.recommendations ?? [],
        recommenderPriorities: trip.recommenderPriorities ?? {},
      };

      await prisma.trip.upsert({
        where: { id: trip.id },
        update: data,
        create: { id: trip.id, ...data },
      });
      tripCount++;
      console.log(`  ✓ Migrated trip: ${trip.name ?? "Untitled"} (${trip.id})`);
    }
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      console.log("  No .travel-planner/trips directory found — skipping trips.");
    } else {
      throw err;
    }
  }

  // ── Preferences ───────────────────────────────────────────────────────
  const prefs = await readJson<any>(PREFS_PATH);
  if (prefs) {
    await prisma.preferences.upsert({
      where: { userId: user.id },
      update: { data: prefs },
      create: { userId: user.id, data: prefs },
    });
    console.log("✓ Migrated preferences");
  } else {
    console.log("  No preferences.json found — skipping.");
  }

  console.log(`\nDone. Migrated ${tripCount} trip(s) and ${prefs ? 1 : 0} preference record.`);
}

main()
  .catch((err) => {
    console.error("✗ Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
