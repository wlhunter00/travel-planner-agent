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
          text: { maxCharacters: 500 },
        },
      }),
    });

    if (!res.ok) return { results: [] };

    const data = await res.json();
    const results: SearchResult[] = (data.results || []).map((r: Record<string, unknown>) => ({
      title: r.title as string,
      url: r.url as string,
      snippet: (r.text as string) || (r.highlights as string[])?.[0] || "",
      publishedDate: r.publishedDate as string,
    }));

    return { results };
  } catch (error) {
    console.error("Exa search error:", error);
    return { results: [] };
  }
}
