# Setup Guide

Follow these steps to get all API keys and configure the app.

## Prerequisites

- **Node.js 18+** ([download](https://nodejs.org/))
- **npm** (comes with Node.js)
- An **OpenAI** account with API access

## 1. OpenAI API Key

You need a key for gpt-5.4.

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Copy the key — you'll add it to `.env.local` later

## 2. Google Cloud (Maps, Places, Directions)

One API key covers four services: Maps Grounding Lite, Places API (New), Directions API, and Maps JavaScript API.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a new project (e.g., "travel-planner")
3. Navigate to **APIs & Services > Library** and enable:
   - **Places API (New)**
   - **Directions API**
   - **Maps JavaScript API**
4. For Maps Grounding Lite (experimental MCP):
   - Search for **"Grounding with Google Maps"** in the API Library and enable it
   - The MCP endpoint is `https://mapstools.googleapis.com/mcp`
5. Go to **APIs & Services > Credentials**
6. Click **Create Credentials > API Key**
7. (Recommended) Restrict the key to the four APIs above
8. Copy the key

**Free tier**: 28,000 requests/month per API. No charges for typical personal use.

## 3. Exa API Key

Exa provides AI-optimized web search for grounding recommendations.

1. Go to [exa.ai](https://exa.ai/) and sign up
2. Navigate to your dashboard
3. Copy your API key

**Free tier**: 1,000 searches/month. Pay-as-you-go: $7/1,000 searches after that.

## 4. SerpAPI Key

SerpAPI powers both hotel search (Google Hotels) and flight search (Google Flights) with one key.

1. Go to [serpapi.com](https://serpapi.com/) and sign up
2. Your API key is shown on the dashboard after signup
3. Copy the key

**Free tier**: 250 searches/month. Starter plan: $25/month for 1,000 searches.

## 6. Peek.com MCP (Tours & Activities)

No API key needed. The Peek.com MCP server provides real-time tour and activity data with availability and pricing.

- Endpoint: `https://mcp.peek.com` (Streamable HTTP), or override with `PEEK_MCP_ENDPOINT` in `.env`
- The app connects to this automatically
- **Usage:** `search_experiences` must use a `regionId` from `search_regions` (opaque ids like `r0dakr`). City names or guessed ids cause Peek to return server errors; the app wraps those so the model gets guidance instead of a bare tool failure.

Exa is also used as a secondary source for tour discovery across Viator, GetYourGuide, and TripAdvisor (covered by your Exa key above).

## Configure Environment Variables

1. Copy the example env file:

```bash
cp .env.example .env.local
```

2. Fill in your keys in `.env.local`:

```
OPENAI_API_KEY=sk-...
GOOGLE_MAPS_API_KEY=AIza...
EXA_API_KEY=...
SERPAPI_API_KEY=...
```

## Verify Keys

Run the verification script after setup:

```bash
npm run verify-keys
```

This makes a simple test call to each API and reports which keys are working.
