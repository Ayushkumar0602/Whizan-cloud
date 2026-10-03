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
    <Link href={href} className={`brand-mark ${className}`.trim()} aria-label="Whizan Cloud">
      <img
        src="/whizan.png"
        alt="Whizan"
        style={{
          height: compact ? "28px" : "34px",
          width: "auto",
          maxWidth: compact ? "110px" : "140px",
          objectFit: "contain",
          display: "block",
        }}
      />
    </Link>
  );
}
