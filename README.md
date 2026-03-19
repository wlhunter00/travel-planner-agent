# Travel Planner Agent

An AI-powered travel planning web app with a Cursor-like split-pane layout. An itinerary viewer on the left builds up as you plan, and a chat panel on the right lets you converse with an AI travel agent.

## Features

- **7-phase guided planning**: Big picture, flights, cities, hotels, day plans, restaurants, review
- **Real-time data**: Flights (Kiwi.com), hotels (SerpAPI), places (Google Places), tours (Viator), web search (Exa)
- **Deep research**: Multi-source parallel search combining Reddit, travel blogs, and structured APIs
- **Persistent memory**: Learns your travel preferences across sessions
- **Multi-trip management**: Save and resume multiple trip plans
- **Export**: JSON, CSV, and iCal formats
- **Auto-save**: Trip state and chat history persist automatically

## Getting Started

1. Follow [SETUP.md](SETUP.md) to get all API keys.

2. Install dependencies:

```bash
npm install
```

3. Copy and fill in environment variables:

```bash
cp .env.example .env.local
# Edit .env.local with your API keys
```

4. Run the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Next.js 16** (App Router)
- **Vercel AI SDK v6** with OpenAI provider
- **React 19** + **shadcn/ui**
- **Tailwind CSS v4**
- **Zustand** for state management

## API Integrations

| Service | Purpose | Auth |
|---------|---------|------|
| OpenAI (gpt-4o) | Core reasoning | API key |
| Google Places API | Place search, photos, reviews | API key |
| Google Directions API | Routing (all modes) | API key |
| Kiwi.com | Flight search | Free, no key |
| SerpAPI | Hotel search with pricing | API key |
| Viator | Tours and activities | API key |
| Exa | Web search for grounding | API key |
