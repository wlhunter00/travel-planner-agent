import { ImageResponse } from "next/og";

export const alt =
  "Travel Planner — plan trips with an AI co-pilot, from loose idea to day-by-day itinerary.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "linear-gradient(135deg, #d97a4a 0%, #c2410c 55%, #7c2d0a 100%)",
          color: "#fdf6e8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              background: "rgba(253, 246, 232, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(253, 246, 232, 0.25)",
            }}
          >
            <svg width="44" height="44" viewBox="0 0 32 32">
              <path
                d="M5 13 L25 16 L13 19 L11 25 L9 18 Z"
                fill="#fdf6e8"
              />
              <path d="M13 19 L11 25 L15 21 Z" fill="#f4e4c1" />
            </svg>
          </div>
          <div
            style={{
              fontSize: "26px",
              fontWeight: 500,
              letterSpacing: "0.02em",
              opacity: 0.9,
            }}
          >
            Travel Planner
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: "92px",
              lineHeight: 1.05,
              fontWeight: 400,
              fontStyle: "italic",
              fontFamily: "serif",
              letterSpacing: "-0.02em",
              maxWidth: "900px",
            }}
          >
            From loose idea to itinerary, in minutes.
          </div>
          <div
            style={{
              fontSize: "30px",
              opacity: 0.82,
              maxWidth: "820px",
              lineHeight: 1.35,
            }}
          >
            Plan trips with an AI co-pilot — picks tuned to how you like to
            travel, organised day by day.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: "22px",
            opacity: 0.7,
          }}
        >
          <div>travel-planner-agent-nine.vercel.app</div>
          <div style={{ display: "flex", gap: "16px" }}>
            <span>Itineraries</span>
            <span>·</span>
            <span>Recommendations</span>
            <span>·</span>
            <span>AI chat</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
