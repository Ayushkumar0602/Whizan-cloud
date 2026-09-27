export type CloudService = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  href?: string;
  available: boolean;
  eta?: string;
  icon?: string;
};

export const CLOUD_SERVICES: CloudService[] = [
  {
    id: "backend-hosting",
    name: "Backend Container Services",
    tagline: "Isolated Docker Runtimes with Auto-Sleep",
    description:
      "Deploy Node.js, Python, and Go microservices with Render-style 0.1 vCPU scale-to-zero free tier and internal service mesh discovery.",
    href: "/dashboard/backend",
    available: true,
  },
  {
    id: "frontend-hosting",
    name: "Frontend Edge Hosting",
    tagline: "Ship Next.js & React sites in minutes",
    description:
      "Connect a GitHub repo, build on high-speed workers, and serve traffic across edge proxies with automated SSL certificates.",
    href: "/dashboard/hosting",
    available: true,
  },
  {
    id: "private-mesh",
    name: "Private Service Mesh & DNS",
    tagline: "Sub-millisecond container discovery",
    description:
      "Zero-configuration internal Docker bridge network allowing frontends to query backend services via http://service-alias:port without public internet traversal.",
    href: "/dashboard/backend",
    available: true,
  },
  {
    id: "managed-postgres",
    name: "PostgreSQL Database",
    tagline: "Dedicated relational storage",
    description:
      "Fully managed Postgres instances with automatic connection pooling, read replicas, and SSL connectivity.",
    href: "/dashboard/admin/database",
    available: true,
  },
  {
    id: "managed-redis",
    name: "In-Memory Redis Cache",
    tagline: "Sub-millisecond caching & Pub/Sub",
    description:
      "Low-latency Redis key-value cache and BullMQ job queue storage running directly on the cloud host.",
    href: "/dashboard/admin/database",
    available: true,
  }
];

export const DEPLOY_GUIDE = [
  {
    n: "01",
    title: "Connect Repository",
    body: "Link your GitHub repository URL and production branch. No zip uploads or manual configurations needed.",
  },
  {
    n: "02",
    title: "Configure Compute & Mesh",
    body: "Choose between Render-style scale-to-zero (0.1 vCPU Free Tier) or dedicated multi-core capacity.",
  },
  {
    n: "03",
    title: "Automated Build Pipeline",
    body: "Isolated worker clones the repo, installs dependencies, executes the build, and starts health checks.",
  },
  {
    n: "04",
    title: "Internal Mesh Discovery",
    body: "Frontends and backends instantly connect over the private Docker network bridge using standard DNS names.",
  },
];
