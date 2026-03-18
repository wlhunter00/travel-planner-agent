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

SerpAPI scrapes Google Hotels for real hotel pricing and booking links.

1. Go to [serpapi.com](https://serpapi.com/) and sign up
2. Your API key is shown on the dashboard after signup
3. Copy the key

**Free tier**: 250 searches/month. Starter plan: $25/month for 1,000 searches.

## 5. Kiwi.com MCP (Flights)

No API key needed. The Kiwi.com MCP server is free and open access.

- Endpoint: `https://api.tequila.kiwi.com/mcp` (Streamable HTTP)
- The app connects to this automatically

## 6. Viator Partner API

Viator provides structured tour and activity data with booking links.

1. Go to [viator.com/partners](https://www.viator.com/partners) and sign up for a partner account
2. Select **Basic Access** (self-service, no approval needed)
3. Once registered, find your API key in the partner dashboard
4. Copy the key

**Free**: Basic access has no cost.

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
VIATOR_API_KEY=...
```

## Verify Keys

Run the verification script after setup:

```bash
npm run verify-keys
```

This makes a simple test call to each API and reports which keys are working.
