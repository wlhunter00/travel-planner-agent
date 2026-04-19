export interface UrlContent {
  title: string;
  url: string;
  text: string;
}

export async function fetchUrlContent(url: string): Promise<UrlContent> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return { title: "", url, text: await fallbackFetchUrl(url) };
  }

  try {
    const res = await fetch("https://api.exa.ai/contents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        urls: [url],
        text: { maxCharacters: 8000 },
      }),
    });

    if (!res.ok) {
      return { title: "", url, text: await fallbackFetchUrl(url) };
    }

    const data = await res.json();
    const result = data.results?.[0];
    if (!result?.text) {
      return { title: "", url, text: await fallbackFetchUrl(url) };
    }

    return {
      title: (result.title as string) || "",
      url,
      text: (result.text as string).trim(),
    };
  } catch {
    return { title: "", url, text: await fallbackFetchUrl(url) };
  }
}

async function fallbackFetchUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TravelPlannerBot/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return `[Failed to fetch URL: HTTP ${res.status}]`;
    const html = await res.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
  } catch {
    return "[Failed to fetch URL content]";
  }
}

interface WebSearchParams {
  query: string;
  numResults: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export async function webSearch(params: WebSearchParams): Promise<{ results: SearchResult[] }> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return { results: [] };

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: params.query,
        numResults: params.numResults || 5,
        useAutoprompt: true,
        type: "auto",
        contents: {
          highlights: {
            numSentences: 3,
            highlightsPerUrl: 1,
          },
          text: { maxCharacters: 300 },
        },
      }),
    });

    if (!res.ok) return { results: [] };

    const data = await res.json();
    const results: SearchResult[] = (data.results || []).map((r: Record<string, unknown>) => {
      const highlights = r.highlights as string[] | undefined;
      const text = r.text as string | undefined;
      const snippet =
        highlights && highlights.length > 0
          ? highlights.join(" ")
          : text?.trim() || "";

      return {
        title: r.title as string,
        url: r.url as string,
        snippet,
        publishedDate: r.publishedDate as string,
      };
    });

    return { results };
  } catch (error) {
    console.error("Exa search error:", error);
    return { results: [] };
  }
}
