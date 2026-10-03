"use client";

import Link from "next/link";

export function BrandMark({
  href = "/",
  compact = false,
  className = "",
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`brand-mark ${className}`.trim()}
      aria-label="Whizan Cloud"
      style={{
        display: "inline-flex",
        alignItems: "center",
        textDecoration: "none",
      }}
    >
      <img
        src="/whizan.png"
        alt="Whizan Cloud"
        style={{
          height: compact ? "36px" : "50px",
          width: "auto",
          maxWidth: compact ? "140px" : "195px",
          objectFit: "contain",
          display: "block",
          imageRendering: "-webkit-optimize-contrast",
        }}
      />
    </Link>
  );
}
