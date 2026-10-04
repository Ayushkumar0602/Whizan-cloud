"use client";

import Link from "next/link";
import Image from "next/image";

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
      className={`brand-mark ${className}`}
      aria-label="Whizan Cloud Services"
    >
      <Image
        src="/whizan_logo.png"
        alt="Whizan Cloud Services"
        width={compact ? 120 : 136}
        height={compact ? 28 : 32}
        priority
        className={`brand-logo-img ${compact ? "brand-logo-compact" : ""}`}
      />
    </Link>
  );
}
