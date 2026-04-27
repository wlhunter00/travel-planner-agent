import { ImageResponse } from "next/og";

export const alt =
  "Travel Planner — an AI co-pilot for itineraries.";
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
          background: "#f3e9d6",
          padding: "70px",
          fontFamily: "serif",
          color: "#2a1810",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            textTransform: "uppercase",
            letterSpacing: "0.32em",
            fontSize: "18px",
            color: "#8a4a2c",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex" }}>Travel Planner</div>
          <div style={{ display: "flex" }}>Vol. 01 — MMXXVI</div>
        </div>
        <div
          style={{
            display: "flex",
            height: "2px",
            background: "#8a4a2c",
            marginTop: "20px",
          }}
        />
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-end",
            paddingBottom: "30px",
          }}
        >
          <div
            style={{
              fontSize: "100px",
              fontStyle: "italic",
              lineHeight: 1,
              letterSpacing: "-0.03em",
              maxWidth: "980px",
              display: "flex",
            }}
          >
            The slowest part of any trip is figuring out where to go.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid #c9a888",
            paddingTop: "20px",
            fontSize: "20px",
            color: "#5a3a25",
            fontFamily: "sans-serif",
            letterSpacing: "0.04em",
          }}
        >
          <div style={{ display: "flex" }}>An AI co-pilot for itineraries</div>
          <div style={{ display: "flex" }}>
            travel-planner-agent-nine.vercel.app
          </div>
        </div>
      </div>
    ),
    size,
  );
}
