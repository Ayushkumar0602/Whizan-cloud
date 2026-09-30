export type CloudService = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  href: string;
  available: boolean;
  category: "Compute" | "Storage" | "DevOps";
  specs: string;
};

export const CLOUD_SERVICES: CloudService[] = [
  {
    id: "frontend-hosting",
    name: "Frontend Edge Hosting",
    tagline: "High-performance web app hosting",
    description:
      "Instant deployments for Next.js, React, Vite, and Astro with automated SSL and edge routing.",
    href: "/dashboard/hosting",
    available: true,
    category: "Compute",
    specs: "Edge CDN • Global SSL • Zero-Downtime",
  },
  {
    id: "backend-hosting",
    name: "Backend Container Services",
    tagline: "Scalable microservices & workers",
    description:
      "Deploy Node.js, Python, Go, and Docker applications with continuous health monitoring.",
    href: "/dashboard/backend",
    available: true,
    category: "Compute",
    specs: "Dedicated / Free Tier • Health Probes",
  },
  {
    id: "managed-postgres",
    name: "PostgreSQL Database",
    tagline: "Enterprise relational database",
    description:
      "Dedicated PostgreSQL with PgBouncer connection pooling, table schema visualizer, and query console.",
    href: "/dashboard/databases",
    available: true,
    category: "Storage",
    specs: "PgBouncer • TLS 1.3 • Web Explorer",
  },
  {
    id: "managed-redis",
    name: "In-Memory Redis Cache",
    tagline: "Sub-millisecond data store",
    description:
      "Low-latency key-value storage and queue broker for background jobs, distributed locking, and caching.",
    href: "/dashboard/databases",
    available: true,
    category: "Storage",
    specs: "TLS Encryption • BullMQ Compatible",
  },
  {
    id: "devops-mcp",
    name: "DevOps Agent MCP",
    tagline: "AI IDE infrastructure integration",
    description:
      "Model Context Protocol server enabling Cursor, Windsurf, and Claude to deploy and manage resources autonomously.",
    href: "/dashboard/mcp",
    available: true,
    category: "DevOps",
    specs: "Stdio Protocol • Cross-IDE Support",
  },
];
