#!/usr/bin/env node

import { config } from "dotenv";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const envFallback = resolve(process.cwd(), ".env");
config({ path: envPath });
config({ path: envFallback });

const checks = [
  {
    name: "OpenAI",
    key: "OPENAI_API_KEY",
    test: async (key) => {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    name: "Google Maps",
    key: "GOOGLE_MAPS_API_KEY",
    test: async (key) => {
      const res = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.displayName",
          },
          body: JSON.stringify({ textQuery: "test", maxResultCount: 1 }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
    },
  },
  {
    name: "Exa",
    key: "EXA_API_KEY",
    test: async (key) => {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ query: "test", numResults: 1, type: "auto" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    name: "SerpAPI",
    key: "SERPAPI_API_KEY",
    test: async (key) => {
      const res = await fetch(
        `https://serpapi.com/account.json?api_key=${key}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
];

const mcpEndpoints = [
  { name: "Peek.com MCP (Tours)", url: "https://mcp.peek.com" },
];

console.log("\n  API Key Verification\n");

let passed = 0;
let failed = 0;

for (const check of checks) {
  const value = process.env[check.key];
  if (!value || value.startsWith("your-")) {
    console.log(`  [ SKIP ] ${check.name} — ${check.key} not set`);
    failed++;
    continue;
  }
  try {
    await check.test(value);
    console.log(`  [  OK  ] ${check.name}`);
    passed++;
  } catch (err) {
    console.log(`  [ FAIL ] ${check.name} — ${err.message}`);
    failed++;
  }
}

console.log("\n  MCP Endpoints\n");

for (const ep of mcpEndpoints) {
  try {
    const res = await fetch(ep.url, { method: "GET" });
    console.log(`  [  OK  ] ${ep.name} — reachable (HTTP ${res.status})`);
    passed++;
  } catch (err) {
    console.log(`  [ FAIL ] ${ep.name} — ${err.message}`);
    failed++;
  }
}

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
