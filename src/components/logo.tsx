import { useId } from "react";

type LogoProps = {
  className?: string;
};

export function Logo({ className }: LogoProps) {
  const id = useId();
  const gradId = `logo-bg-${id}`;
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Travel Planner"
      className={className}
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="0"
          y1="0"
          x2="0"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#f4b76a" />
          <stop offset="0.55" stopColor="#d97a4a" />
          <stop offset="1" stopColor="#5a1f3a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill={`url(#${gradId})`} />
      <circle cx="20" cy="14" r="3.6" fill="#fdf6e8" />
      <path d="M2 27 L11 12 L19 27 Z" fill="#3a1a0a" opacity="0.85" />
      <path d="M11 27 L20 16.5 L30 27 Z" fill="#1a0805" />
    </svg>
  );
}
