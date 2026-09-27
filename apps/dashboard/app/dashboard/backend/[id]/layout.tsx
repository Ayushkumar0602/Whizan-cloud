"use client";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Radio, Settings2 } from "lucide-react";
import type { ReactNode } from "react";

export default function ServiceDetailLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();

  const tabs = [
    {
      href: `/dashboard/backend/${id}`,
      label: "Overview",
      icon: LayoutDashboard,
      active: pathname === `/dashboard/backend/${id}`,
    },
    {
      href: `/dashboard/backend/${id}/mesh`,
      label: "Service Mesh & DNS",
      icon: Radio,
      active: pathname.startsWith(`/dashboard/backend/${id}/mesh`),
    },
  ];

  return (
    <div>
      {/* Sub-page Tab Bar */}
      <div className="service-tab-bar">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`service-tab${tab.active ? " service-tab-active" : ""}`}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {children}

      <style>{`
        .service-tab-bar {
          display: flex;
          align-items: center;
          gap: 0;
          background: var(--card);
          border-bottom: 1px solid var(--card-border);
          padding: 0 2.5rem;
          position: sticky;
          top: 0;
          z-index: 30;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .service-tab-bar::-webkit-scrollbar { display: none; }

        .service-tab {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.8rem 1.1rem;
          font-size: 0.84rem;
          font-weight: 500;
          color: var(--muted);
          text-decoration: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        .service-tab:hover { color: var(--foreground); }
        .service-tab-active {
          color: var(--accent);
          border-bottom-color: var(--accent);
          font-weight: 600;
        }

        @media (max-width: 640px) {
          .service-tab-bar { padding: 0 1rem; }
          .service-tab { padding: 0.7rem 0.75rem; font-size: 0.8rem; }
        }
      `}</style>
    </div>
  );
}
