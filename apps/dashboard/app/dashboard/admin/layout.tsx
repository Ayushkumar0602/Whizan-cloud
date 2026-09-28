"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Container,
  HardDrive,
  Terminal,
  Database,
  ShieldAlert,
  Server
} from "lucide-react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/admin/containers", label: "Containers", icon: Container },
    { href: "/dashboard/admin/storage", label: "Storage", icon: HardDrive },
    { href: "/dashboard/admin/terminal", label: "VM Terminal", icon: Terminal },
    { href: "/dashboard/admin/database", label: "Databases", icon: Database },
    { href: "/dashboard/admin/logs", label: "Host Logs", icon: Server },
  ];

  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      {/* Admin Portal Header Banner */}
      <div className="admin-portal-header">
        <div className="admin-title-area">
          <div className="admin-icon-pill">
            <ShieldAlert size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="admin-portal-title">Cloud Infrastructure Admin</h1>
            <p className="admin-portal-sub">
              Monitor cloud host resources, BullMQ queues, live Docker containers, and edge proxies.
            </p>
          </div>
        </div>

        {/* Responsive Horizontal Nav Tabs */}
        <nav className="admin-nav-bar">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`admin-nav-tab ${active ? "admin-nav-tab-active" : ""}`}
              >
                <Icon size={16} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="admin-page-content">
        {children}
      </div>

      <style>{`
        .admin-portal-header {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-bottom: 2rem;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid var(--card-border);
        }

        .admin-title-area {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .admin-icon-pill {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .admin-portal-title {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: -0.03em;
        }

        .admin-portal-sub {
          font-size: 0.88rem;
          color: var(--muted);
          margin-top: 0.2rem;
        }

        /* Responsive Nav Tabs */
        .admin-nav-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 10px;
          padding: 0.35rem;
          overflow-x: auto;
        }

        .admin-nav-tab {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 1rem;
          border-radius: 8px;
          font-size: 0.84rem;
          font-weight: 600;
          color: var(--muted);
          text-decoration: none;
          white-space: nowrap;
          transition: all 0.15s ease;
          border: 1px solid transparent;
        }

        .admin-nav-tab:hover {
          color: var(--foreground);
          background: var(--card-hover);
        }

        .admin-nav-tab-active {
          background: var(--card) !important;
          color: var(--accent) !important;
          border-color: rgba(99, 102, 241, 0.25) !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .admin-page-content {
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
        }

        @media (max-width: 640px) {
          .admin-portal-title {
            font-size: 1.45rem;
          }
          .admin-nav-tab {
            padding: 0.45rem 0.75rem;
            font-size: 0.78rem;
          }
        }
      `}</style>
    </div>
  );
}
