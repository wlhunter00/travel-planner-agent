import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #d97a4a 0%, #c2410c 60%, #8a2c08 100%)",
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5 13 L25 16 L13 19 L11 25 L9 18 Z" fill="#fdf6e8" />
          <path d="M13 19 L11 25 L15 21 Z" fill="#f4e4c1" />
        </svg>
      </div>
    ),
    size,
  );
}
