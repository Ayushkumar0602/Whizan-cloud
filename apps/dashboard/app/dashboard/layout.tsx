"use client";
import { useAuth } from "@/lib/auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import {
  LayoutDashboard, Globe, Settings, LogOut, ShieldAlert,
  Layers, Moon, Sun, Server, Menu, X, Plus,
  PanelLeftClose, PanelLeftOpen, Database, Sparkles, Zap, Clock
} from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [theme, setTheme] = useState("dark");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Restore preferences from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setTheme("light");
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      setTheme("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    }
    const savedCollapsed = localStorage.getItem("sidebar-collapsed");
    if (savedCollapsed === "true") setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      if (
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ) {
        return;
      }
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  if (loading || !user) {
    return (
      <div className="page-loading" style={{ minHeight: "100vh" }}>
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 500 }}>
          Authenticating session...
        </span>
      </div>
    );
  }

  interface NavItem {
    href: string;
    icon: any;
    label: string;
    match: (p: string) => boolean;
    badge?: string;
  }

  interface NavSection {
    heading: string;
    items: NavItem[];
  }

  const navSections: NavSection[] = [
    {
      heading: "Overview",
      items: [
        { href: "/dashboard", icon: LayoutDashboard, label: "Console", match: (p: string) => p === "/dashboard" },
      ]
    },
    {
      heading: "Compute & Apps",
      items: [
        { href: "/dashboard/hosting",   icon: Globe,       label: "Frontend Hosting",  match: (p: string) => p.startsWith("/dashboard/hosting") || p.startsWith("/dashboard/projects") },
        { href: "/dashboard/backend",   icon: Server,      label: "Backend Services",  match: (p: string) => p.startsWith("/dashboard/backend") },
        { href: "/dashboard/functions", icon: Zap,         label: "Edge Functions",    match: (p: string) => p.startsWith("/dashboard/functions"), badge: "EDGE" },
        { href: "/dashboard/cron",      icon: Clock,       label: "Cron & Schedules",  match: (p: string) => p.startsWith("/dashboard/cron"), badge: "0-IDLE" },
        { href: "/dashboard/databases", icon: Database,    label: "Databases",         match: (p: string) => p.startsWith("/dashboard/databases") },
        { href: "/dashboard/services",  icon: Layers,      label: "Services Catalog",  match: (p: string) => p === "/dashboard/services" },
      ]
    },
    {
      heading: "Platform & Admin",
      items: [
        ...((user?.role === "ROOT_ADMIN" || user?.role === "ADMIN" || user?.role === "DEVOPS_ADMIN" || user?.role === "SUPPORT_ADMIN" || user?.email === "aj0892829122@gmail.com") ? [{
          href: "/dashboard/admin",
          icon: ShieldAlert,
          label: "Platform Monitor",
          match: (p: string) => p.startsWith("/dashboard/admin"),
          badge: user?.role === "ROOT_ADMIN" || user?.email === "aj0892829122@gmail.com" ? "ROOT" : "ADMIN"
        }] : []),
        { href: "/dashboard/settings", icon: Settings,    label: "Settings",          match: (p: string) => p.startsWith("/dashboard/settings") },
      ]
    }
  ];

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const initials = (user?.name || user?.email || "U")[0]?.toUpperCase() || "U";

  // Full expanded sidebar content
  const fullSidebarContent = (
    <>
      <div className="sidebar-top">
        <div className="sidebar-brand-row">
          <BrandMark href="/dashboard" />
          {mobileMenuOpen && (
            <button onClick={() => setMobileMenuOpen(false)} className="icon-btn-rounded" aria-label="Close menu">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Cloud Health Pill */}
        <div className="mesh-indicator-pill">
          <div className="mesh-pulse-dot" />
          <span className="mesh-pill-text">Whizan Cloud</span>
          <span className="mesh-pill-tag">ONLINE</span>
        </div>

        {/* Quick Deploy */}
        <div style={{ marginTop: "1rem" }}>
          <Link href="/dashboard/deploy" className="quick-deploy-btn">
            <Plus size={15} />
            <span>Deploy New Service</span>
          </Link>
        </div>

        {/* Nav Items */}
        <nav className="sidebar-nav">
          {navSections.map(section => (
            <div key={section.heading} className="nav-group">
              <div className="nav-group-label">{section.heading}</div>
              {section.items.map(item => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link ${active ? "nav-link-active" : ""}`}
                  >
                    <Icon size={17} className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Sidebar Footer */}
      <div className="sidebar-bottom">
        <div className="user-profile-card">
          <div className="user-avatar-glow">{initials}</div>
          <div className="user-meta">
            <div className="user-name" title={user.name || "Developer"}>{user.name || "Developer"}</div>
            <div className="user-email" title={user.email}>{user.email}</div>
          </div>
        </div>

        <div className="sidebar-actions-row">
          <button onClick={toggleTheme} className="action-pill-btn" title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark"
              ? <><Sun size={14} className="text-amber" /><span>Light</span></>
              : <><Moon size={14} className="text-indigo" /><span>Dark</span></>
            }
          </button>
          <button onClick={handleLogout} className="action-pill-btn action-pill-danger" id="logout-btn" title="Sign out">
            <LogOut size={14} /><span>Logout</span>
          </button>
        </div>

        {/* Sidebar Collapse Toggle (desktop only) */}
        <button
          className="sidebar-collapse-btn"
          onClick={toggleSidebar}
          title="Collapse sidebar"
        >
          <PanelLeftClose size={15} />
          <span>Collapse</span>
        </button>
      </div>
    </>
  );

  // Collapsed icon-only rail
  const collapsedSidebarContent = (
    <div className="sidebar-rail">
      {/* Brand icon */}
      <Link href="/dashboard" className="rail-brand-icon" title="Console">
        <LayoutDashboard size={18} />
      </Link>

      {/* Nav icons */}
      <div className="rail-nav">
        {navSections.flatMap(s => s.items).map(item => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rail-link ${active ? "rail-link-active" : ""}`}
              title={item.label}
            >
              <Icon size={18} />
            </Link>
          );
        })}
      </div>

      {/* Bottom expand button */}
      <div className="rail-bottom">
        <button onClick={toggleTheme} className="rail-icon-btn" title="Toggle theme">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="rail-icon-btn rail-expand-btn"
          onClick={toggleSidebar}
          title="Expand sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={`dash-shell ${sidebarCollapsed ? "dash-shell-collapsed" : ""}`}>
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button onClick={() => setMobileMenuOpen(true)} className="icon-btn-rounded" aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <BrandMark href="/dashboard" compact />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button onClick={toggleTheme} className="icon-btn-rounded" title="Toggle theme">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link href="/dashboard/settings" className="user-avatar-sm" title={user.email}>
            {initials}
          </Link>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)}>
          <aside className="mobile-drawer" onClick={e => e.stopPropagation()}>
            {fullSidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="desktop-sidebar">
        {sidebarCollapsed ? collapsedSidebarContent : fullSidebarContent}
      </aside>

      {/* Main */}
      <main className="dash-main">
        {children}
      </main>

      <style>{`
        .dash-shell {
          display: flex;
          min-height: 100vh;
          background: var(--background);
        }

        /* ── Desktop Sidebar (expanded) ── */
        .desktop-sidebar {
          width: 260px;
          height: 100vh;
          position: sticky;
          top: 0;
          background: var(--card);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-right: 1px solid var(--card-border);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1.25rem 1rem;
          flex-shrink: 0;
          z-index: 40;
          overflow-y: auto;
          overflow-x: hidden;
          transition: width 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* ── Collapsed rail ── */
        .dash-shell-collapsed .desktop-sidebar {
          width: 60px;
          padding: 0;
          overflow: visible;
        }

        .sidebar-rail {
          width: 60px;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem 0;
          gap: 0.25rem;
        }

        .rail-brand-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          background: var(--accent-glow);
          text-decoration: none;
          margin-bottom: 0.75rem;
          transition: all 0.15s ease;
        }
        .rail-brand-icon:hover { background: rgba(99,102,241,0.25); }

        .rail-nav {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          flex: 1;
          width: 100%;
          padding: 0 0.5rem;
        }

        .rail-link {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
          text-decoration: none;
          transition: all 0.15s ease;
          position: relative;
        }
        .rail-link:hover { background: var(--card-hover); color: var(--foreground); }
        .rail-link-active { background: var(--accent-glow); color: var(--accent); }

        .rail-bottom {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          padding: 0 0.5rem;
          width: 100%;
        }
        .rail-icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .rail-icon-btn:hover { background: var(--card-hover); color: var(--foreground); }
        .rail-expand-btn { color: var(--accent); }
        .rail-expand-btn:hover { background: var(--accent-glow); }

        /* ── Sidebar Collapse Button ── */
        .sidebar-collapse-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          width: 100%;
          padding: 0.42rem 0.7rem;
          border-radius: 7px;
          background: transparent;
          border: 1px solid var(--card-border);
          font-size: 0.76rem;
          font-weight: 550;
          color: var(--muted);
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
          margin-top: 0.25rem;
        }
        .sidebar-collapse-btn:hover {
          background: var(--card-hover);
          color: var(--foreground);
          border-color: var(--muted-fg);
        }

        /* ── Sidebar internals ── */
        .sidebar-brand-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sidebar-top { display: flex; flex-direction: column; }

        .mesh-indicator-pill {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(16,185,129,0.08);
          border: 1px solid rgba(16,185,129,0.2);
          border-radius: 9999px;
          padding: 0.3rem 0.65rem;
          margin-top: 1rem;
          font-size: 0.72rem;
          color: var(--foreground);
        }
        .mesh-pulse-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #10b981; box-shadow: 0 0 8px #10b981;
          animation: pulseGlow 2s infinite ease-in-out;
          flex-shrink: 0;
        }
        .mesh-pill-text {
          font-family: var(--font-geist-mono), monospace;
          font-size: 0.72rem; color: var(--muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
        }
        .mesh-pill-tag { font-size: 0.62rem; font-weight: 700; color: #10b981; letter-spacing: 0.04em; }

        .quick-deploy-btn {
          display: flex; align-items: center; justify-content: center; gap: 0.45rem;
          width: 100%; padding: 0.6rem 0.85rem; border-radius: 8px;
          background: var(--accent-gradient); color: #ffffff;
          font-size: 0.82rem; font-weight: 600; text-decoration: none;
          box-shadow: 0 4px 14px var(--accent-glow); transition: all 0.15s ease;
        }
        .quick-deploy-btn:hover { transform: translateY(-1px); opacity: 0.93; box-shadow: 0 6px 18px var(--accent-glow); }

        .sidebar-nav { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1.5rem; }
        .nav-group { display: flex; flex-direction: column; gap: 0.2rem; }
        .nav-group-label {
          font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--muted); padding: 0 0.65rem; margin-bottom: 0.35rem;
        }
        .nav-link {
          display: flex; align-items: center; gap: 0.65rem;
          padding: 0.55rem 0.75rem; border-radius: 8px;
          font-size: 0.84rem; font-weight: 500; color: var(--muted);
          text-decoration: none; transition: all 0.15s cubic-bezier(0.16,1,0.3,1);
          border: 1px solid transparent;
        }
        .nav-link:hover { background: var(--card-hover); color: var(--foreground); border-color: rgba(255,255,255,0.04); }
        .nav-link-active { background: var(--accent-glow); color: var(--accent); font-weight: 600; border-color: rgba(99,102,241,0.25); }
        .nav-icon { flex-shrink: 0; opacity: 0.85; }
        .nav-link-active .nav-icon { opacity: 1; color: var(--accent); }
        .nav-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nav-badge {
          font-size: 0.64rem; font-weight: 700; text-transform: uppercase;
          padding: 0.1rem 0.4rem; border-radius: 4px;
          background: rgba(99,102,241,0.15); color: var(--accent);
          font-family: var(--font-geist-mono), monospace;
        }

        .sidebar-bottom {
          padding-top: 1rem; border-top: 1px solid var(--card-border);
          display: flex; flex-direction: column; gap: 0.65rem; margin-top: 1.5rem;
        }
        .user-profile-card {
          display: flex; align-items: center; gap: 0.65rem;
          padding: 0.4rem 0.5rem; border-radius: 8px;
          background: rgba(255,255,255,0.03); border: 1px solid var(--card-border);
        }
        .user-avatar-glow {
          width: 34px; height: 34px; border-radius: 50%;
          background: var(--accent-gradient); color: #ffffff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 0.85rem; flex-shrink: 0;
          box-shadow: 0 2px 8px var(--accent-glow);
        }
        .user-meta { flex: 1; min-width: 0; }
        .user-name { font-size: 0.82rem; font-weight: 600; color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .user-email { font-size: 0.72rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .sidebar-actions-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
        .action-pill-btn {
          display: flex; align-items: center; justify-content: center; gap: 0.4rem;
          padding: 0.45rem 0.6rem; border-radius: 6px; background: var(--bg-inset);
          border: 1px solid var(--card-border); font-size: 0.76rem; font-weight: 550;
          color: var(--muted); cursor: pointer; transition: all 0.15s ease; font-family: inherit;
        }
        .action-pill-btn:hover { background: var(--card-hover); color: var(--foreground); border-color: var(--muted-fg); }
        .action-pill-danger:hover { background: var(--danger-glow); color: var(--danger); border-color: rgba(244,63,94,0.3); }

        .text-amber { color: #f59e0b; }
        .text-indigo { color: #818cf8; }

        /* ── Mobile Header ── */
        .mobile-header {
          display: none; position: sticky; top: 0; z-index: 50;
          background: var(--card); backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--card-border);
          padding: 0.75rem 1rem;
          align-items: center; justify-content: space-between;
        }
        .icon-btn-rounded {
          background: var(--bg-inset); border: 1px solid var(--card-border);
          color: var(--foreground); width: 36px; height: 36px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s ease;
        }
        .icon-btn-rounded:hover { background: var(--card-hover); border-color: var(--muted-fg); }
        .user-avatar-sm {
          width: 32px; height: 32px; border-radius: 50%;
          background: var(--accent-gradient); color: #ffffff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 0.8rem; text-decoration: none;
        }

        /* ── Mobile Drawer ── */
        .mobile-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.65);
          backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
          z-index: 99; display: flex;
        }
        .mobile-drawer {
          width: 290px; max-width: 85vw; height: 100%;
          background: var(--card); border-right: 1px solid var(--card-border);
          padding: 1.25rem 1rem; display: flex; flex-direction: column;
          justify-content: space-between; overflow-y: auto;
          box-shadow: 0 0 40px rgba(0,0,0,0.5);
          animation: slideInLeft 0.22s cubic-bezier(0.16,1,0.3,1) forwards;
        }

        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }

        .dash-main { flex: 1; min-width: 0; overflow-y: auto; }

        /* ── Responsive ── */
        @media (max-width: 1023px) {
          .dash-shell { flex-direction: column; }
          .desktop-sidebar { display: none; }
          .mobile-header { display: flex; }
        }
      `}</style>
    </div>
  );
}
