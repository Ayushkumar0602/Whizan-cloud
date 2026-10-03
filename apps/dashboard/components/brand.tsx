"use client";

import Link from "next/link";

export function BrandMark({
  href = "/",
  compact = false,
  fullWidth = false,
  className = "",
}: {
  href?: string;
  compact?: boolean;
  fullWidth?: boolean;
  className?: string;
}) {
  if (fullWidth) {
    return (
      <Link
        href={href}
        className={`brand-mark brand-mark-card ${className}`.trim()}
        aria-label="Whizan Cloud"
      >
        <img
          src="/whizan.png"
          alt="Whizan Cloud"
          className="brand-logo-img-full"
          style={{
            width: "100%",
            height: "auto",
            maxHeight: "64px",
            objectFit: "contain",
            display: "block",
            imageRendering: "-webkit-optimize-contrast",
          }}
        />
      </Link>
    );
  }

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
          height: compact ? "38px" : "50px",
          width: "auto",
          maxWidth: compact ? "145px" : "195px",
          objectFit: "contain",
          display: "block",
          imageRendering: "-webkit-optimize-contrast",
        }}
      />
    </Link>
  );
}
