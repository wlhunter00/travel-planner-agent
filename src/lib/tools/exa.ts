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
