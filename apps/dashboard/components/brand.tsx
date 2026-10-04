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
      className={`brand-mark ${compact ? "brand-mark-compact" : ""} ${className}`}
      aria-label="Whizan Cloud Services"
    >
      <Image
        src="/whizan_logo.png"
        alt="Whizan Cloud Services"
        width={compact ? 130 : 205}
        height={compact ? 34 : 52}
        priority
        className={`brand-logo-img ${compact ? "brand-logo-compact" : ""}`}
      />
    </Link>
  );
}
