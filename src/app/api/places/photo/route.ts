import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies Google Places Photo media URLs so API keys never reach the browser as `?key=` in `<img src>`.
 * With `skipHttpRedirect=true`, Places returns `{ photoUri: "https://..." }` pointing at a CDN.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const nameRaw = req.nextUrl.searchParams.get("name");
  const w = req.nextUrl.searchParams.get("w") || "400";

  if (!apiKey || !nameRaw?.trim()) {
    return NextResponse.json({ error: "Missing photo or API key" }, { status: 400 });
  }

  const resourceName = decodeURIComponent(nameRaw).replace(/^\/?/, "");
  const url = `https://places.googleapis.com/v1/${resourceName}/media?maxHeightPx=${encodeURIComponent(
    w,
  )}&skipHttpRedirect=true`;

  try {
    const res = await fetch(url, {
      headers: { "X-Goog-Api-Key": apiKey },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream photo error", status: res.status },
        { status: res.status >= 400 ? res.status : 502 },
      );
    }

    const data = (await res.json()) as { photoUri?: string };
    if (!data.photoUri?.startsWith("http")) {
      return NextResponse.json({ error: "No photo URI" }, { status: 502 });
    }

    return NextResponse.redirect(data.photoUri, {
      status: 307,
      headers: {
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Photo proxy failed" }, { status: 502 });
  }
}
