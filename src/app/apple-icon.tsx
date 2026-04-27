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
          background:
            "linear-gradient(180deg, #f4b76a 0%, #d97a4a 55%, #5a1f3a 100%)",
        }}
      >
        <svg
          width="180"
          height="180"
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="20" cy="14" r="3.6" fill="#fdf6e8" />
          <path d="M2 27 L11 12 L19 27 Z" fill="#3a1a0a" opacity="0.85" />
          <path d="M11 27 L20 16.5 L30 27 Z" fill="#1a0805" />
        </svg>
      </div>
    ),
    size,
  );
}
