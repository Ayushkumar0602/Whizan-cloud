"use client";
import { useAuth, isIamOrRootAdmin } from "@/lib/auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { getSafeRedirectUrl } from "@/lib/redirect";
import {
  LayoutDashboard, Globe, Settings, LogOut, ShieldAlert,
  Layers, Server, Menu, X, Plus,
  PanelLeftClose, PanelLeftOpen, Database, Zap, Clock, Workflow as WorkflowIcon,
  Bot, BookOpen, Terminal, Mail
} from "lucide-react";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { SummerDrawer } from "@/components/agent/summer-drawer";
import { AccountTerminal } from "@/components/account-terminal";
import { isTwoFactorTrusted } from "@/lib/webauthn";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { vmOnline } = useSystemStatus();
  const router = useRouter();
  const pathname = usePathname();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  // Global keyboard shortcut and event listeners to toggle Cloud Terminal
  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if ((e.altKey && (e.key === "t" || e.key === "T")) || ((e.ctrlKey || e.metaKey) && e.key === "`")) {
        e.preventDefault();
        setTerminalOpen(prev => !prev);
      }
    }
    const handleToggle = () => setTerminalOpen(prev => !prev);
    const handleOpen = () => setTerminalOpen(true);
    const handleClose = () => setTerminalOpen(false);

    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("whizan:toggle-terminal", handleToggle);
    window.addEventListener("whizan:open-terminal", handleOpen);
    window.addEventListener("whizan:close-terminal", handleClose);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener("whizan:toggle-terminal", handleToggle);
      window.removeEventListener("whizan:open-terminal", handleOpen);
      window.removeEventListener("whizan:close-terminal", handleClose);
    };
  }, []);

  // Restore sidebar preference from localStorage
  useEffect(() => {
    const savedCollapsed = localStorage.getItem("sidebar-collapsed");
    if (savedCollapsed === "true") setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      const currentTarget =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : pathname;
      const safeTarget = getSafeRedirectUrl(currentTarget, "/dashboard");
      router.replace(`/login?redirect=${encodeURIComponent(safeTarget)}`);
    } else if (!loading && user) {
      // 1. Unverified accounts are permitted into the dashboard in View-Only mode
      if (user.emailVerified === false) {
        return;
      }

      // 2. Verified accounts require active 3-day 2FA trust on this hardware device
      const isTrusted = isTwoFactorTrusted(user.email);
      if (!isTrusted) {
        const currentTarget =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : pathname;
        const safeTarget = getSafeRedirectUrl(currentTarget, "/dashboard");
        router.replace(`/login?redirect=${encodeURIComponent(safeTarget)}&reason=2fa_required`);
      }
    }
  }, [user, loading, router, pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
        { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", match: (p: string) => p === "/dashboard" },
        { href: "/dashboard/services", icon: Layers, label: "Services Catalog", match: (p: string) => p === "/dashboard/services" },
      ]
    },
    {
      heading: "Compute & Applications",
      items: [
        { href: "/dashboard/hosting", icon: Globe, label: "Frontend Hosting", match: (p: string) => p.startsWith("/dashboard/hosting") || p.startsWith("/dashboard/projects") },
        { href: "/dashboard/backend", icon: Server, label: "Backend Services", match: (p: string) => p.startsWith("/dashboard/backend") },
        { href: "/dashboard/functions", icon: Zap, label: "Edge Functions", match: (p: string) => p.startsWith("/dashboard/functions") },
        { href: "/dashboard/databases", icon: Database, label: "Databases", match: (p: string) => p.startsWith("/dashboard/databases") },
      ]
    },
    {
      heading: "Developer Tools",
      items: [
        { href: "/docs", icon: BookOpen, label: "Documentation", match: (p: string) => p.startsWith("/docs") },
        { href: "/dashboard/cli", icon: Terminal, label: "CLI & SDK", match: (p: string) => p.startsWith("/dashboard/cli") },
        { href: "/dashboard/flows", icon: WorkflowIcon, label: "Whizan Flow", match: (p: string) => p.startsWith("/dashboard/flows") },
        { href: "/dashboard/cron", icon: Clock, label: "Cron Jobs", match: (p: string) => p.startsWith("/dashboard/cron") },
        { href: "/dashboard/mcp", icon: Bot, label: "MCP & AI DevOps", match: (p: string) => p.startsWith("/dashboard/mcp") },
      ]
    },
    {
      heading: isIamOrRootAdmin(user) ? "Platform & Admin" : "Platform",
      items: [
        ...(isIamOrRootAdmin(user) ? [{
          href: "/dashboard/admin",
          icon: ShieldAlert,
          label: "Monitoring",
          match: (p: string) => p.startsWith("/dashboard/admin"),
        }] : []),
        { href: "/dashboard/contact", icon: Mail, label: "Contact Support", match: (p: string) => p.startsWith("/dashboard/contact") },
        { href: "/dashboard/settings", icon: Settings, label: "Settings", match: (p: string) => p.startsWith("/dashboard/settings") },
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

        {/* Cloud Health Status */}
        <Link href="/dashboard/contact" style={{ textDecoration: "none" }}>
          <div className="mesh-indicator-pill" style={{ borderColor: vmOnline ? undefined : "rgba(245, 158, 11, 0.4)" }}>
            <div className="mesh-pulse-dot" style={{ background: vmOnline ? undefined : "var(--warning)" }} />
            <span className="mesh-pill-text">Cloud Compute</span>
            <span
              className="mesh-pill-tag"
              style={{
                background: vmOnline ? undefined : "rgba(245, 158, 11, 0.15)",
                color: vmOnline ? undefined : "var(--warning)",
              }}
            >
              {vmOnline ? "ACTIVE" : "PAUSED"}
            </span>
          </div>
        </Link>

        {/* Quick Deploy CTA */}
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
          <Link href="/dashboard/settings" className="action-pill-btn" title="Account Settings">
            <Settings size={14} />
            <span>Settings</span>
          </Link>
          <button onClick={handleLogout} className="action-pill-btn action-pill-danger" id="logout-btn" title="Sign out">
            <LogOut size={14} />
            <span>Logout</span>
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
        <Link href="/dashboard/settings" className="rail-icon-btn" title="Settings">
          <Settings size={16} />
        </Link>
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
          <button
            type="button"
            onClick={() => setTerminalOpen(prev => !prev)}
            className="icon-btn-rounded"
            title="Cloud Shell (⌥T)"
            aria-label="Cloud Shell"
          >
            <Terminal size={17} />
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

      {/* Main Container with subtle Aurora Background */}
      <main className="dash-main aurora-bg">
        <MaintenanceBanner />
        <EmailVerificationBanner />
        {children}
        <SummerDrawer />
        <AccountTerminal isOpen={terminalOpen} onClose={() => setTerminalOpen(false)} />
      </main>

      <style>{`
        .dash-shell {
          display: flex;
          min-height: 100vh;
          background: var(--background);
        }

        /* Desktop Sidebar (expanded) */
        .desktop-sidebar {
          width: 254px;
          height: 100vh;
          position: sticky;
          top: 0;
          background: #ffffff;
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1.25rem 1rem;
          flex-shrink: 0;
          z-index: 40;
          overflow-y: auto;
          overflow-x: hidden;
          transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 1px 0 3px 0 rgba(0, 0, 0, 0.02);
        }

        /* Collapsed rail */
        .dash-shell-collapsed .desktop-sidebar {
          width: 62px;
          padding: 0;
          overflow: visible;
        }

        .sidebar-rail {
          width: 62px;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.1rem 0;
          gap: 0.35rem;
        }

        .rail-brand-icon {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          background: rgba(79, 70, 229, 0.08);
          text-decoration: none;
          margin-bottom: 0.85rem;
          transition: all 0.15s ease;
        }
        .rail-brand-icon:hover {
          background: rgba(79, 70, 229, 0.14);
        }

        .rail-nav {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          flex: 1;
          width: 100%;
          padding: 0 0.5rem;
        }

        .rail-link {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
          text-decoration: none;
          transition: all 0.15s ease;
          position: relative;
        }
        .rail-link:hover {
          background: var(--bg-inset);
          color: var(--foreground);
        }
        .rail-link-active {
          background: rgba(79, 70, 229, 0.09);
          color: var(--accent);
          font-weight: 600;
        }

        .rail-bottom {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          padding: 0 0.5rem;
          width: 100%;
        }
        .rail-icon-btn {
          width: 38px;
          height: 38px;
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
        .rail-icon-btn:hover {
          background: var(--bg-inset);
          color: var(--foreground);
        }
        .rail-expand-btn {
          color: var(--accent);
        }
        .rail-expand-btn:hover {
          background: rgba(79, 70, 229, 0.09);
        }

        /* Sidebar Collapse Button */
        .sidebar-collapse-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          width: 100%;
          padding: 0.45rem 0.7rem;
          border-radius: 7px;
          background: #ffffff;
          border: 1px solid var(--border);
          font-size: 0.76rem;
          font-weight: 550;
          color: var(--muted);
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
          margin-top: 0.35rem;
        }
        .sidebar-collapse-btn:hover {
          background: var(--bg-inset);
          color: var(--foreground);
          border-color: var(--card-border-hover);
        }

        /* Sidebar internals */
        .sidebar-brand-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.6rem 0.35rem 0.5rem 0.35rem;
          margin-bottom: 0.25rem;
        }

        .sidebar-brand-row .brand-mark {
          display: flex;
          align-items: center;
          flex: 1;
          padding: 0.2rem 0;
        }

        .sidebar-brand-row .brand-logo-img {
          width: 100%;
          max-width: 205px;
          height: auto;
          max-height: 52px;
          object-fit: contain;
          object-position: left center;
        }

        .sidebar-top {
          display: flex;
          flex-direction: column;
        }

        .mesh-indicator-pill {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 0.35rem 0.65rem;
          margin-top: 0.75rem;
          font-size: 0.73rem;
          color: #475569;
          transition: all 0.15s ease;
        }
        .mesh-indicator-pill:hover {
          border-color: #cbd5e1;
          background: #f1f5f9;
        }
        .mesh-pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
          animation: pulseGlow 2s infinite ease-in-out;
          flex-shrink: 0;
        }
        .mesh-pill-text {
          font-size: 0.73rem;
          font-weight: 500;
          color: #334155;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }
        .mesh-pill-tag {
          font-size: 0.64rem;
          font-weight: 600;
          color: #059669;
          letter-spacing: 0.03em;
        }

        .quick-deploy-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          width: 100%;
          padding: 0.52rem 0.85rem;
          border-radius: 7px;
          background: #0f172a;
          color: #ffffff;
          font-size: 0.82rem;
          font-weight: 600;
          text-decoration: none;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
          transition: all 0.15s ease;
        }
        .quick-deploy-btn:hover {
          background: #1e293b;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 1.15rem;
          margin-top: 1.15rem;
        }
        .nav-group {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .nav-group-label {
          font-size: 0.68rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #94a3b8;
          padding: 0 0.65rem;
          margin-bottom: 0.25rem;
        }
        .nav-link {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.48rem 0.7rem;
          border-radius: 7px;
          font-size: 0.835rem;
          font-weight: 500;
          color: #475569;
          text-decoration: none;
          transition: all 0.12s ease;
        }
        .nav-link:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .nav-link-active {
          background: #eef2ff;
          color: #4f46e5;
          font-weight: 600;
        }
        .nav-icon {
          flex-shrink: 0;
          color: #64748b;
          transition: color 0.12s ease;
        }
        .nav-link:hover .nav-icon {
          color: #0f172a;
        }
        .nav-link-active .nav-icon {
          color: #4f46e5;
        }
        .nav-label {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .nav-badge {
          font-size: 0.64rem;
          font-weight: 700;
          text-transform: uppercase;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          background: rgba(79, 70, 229, 0.1);
          color: var(--accent);
          font-family: var(--font-geist-mono), monospace;
        }

        .sidebar-bottom {
          padding-top: 0.85rem;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 1.15rem;
        }
        .user-profile-card {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.45rem 0.55rem;
          border-radius: 8px;
          background: var(--bg-inset);
          border: 1px solid var(--border);
        }
        .user-avatar-glow {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: linear-gradient(135deg, #4f46e5, #06b6d4);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.82rem;
          flex-shrink: 0;
        }
        .user-meta {
          flex: 1;
          min-width: 0;
        }
        .user-name {
          font-size: 0.81rem;
          font-weight: 600;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .user-email {
          font-size: 0.72rem;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sidebar-actions-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.4rem;
        }
        .action-pill-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 0.45rem 0.6rem;
          border-radius: 6px;
          background: #ffffff;
          border: 1px solid var(--border);
          font-size: 0.76rem;
          font-weight: 550;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
          text-decoration: none;
        }
        .action-pill-btn:hover {
          background: var(--bg-inset);
          color: var(--foreground);
          border-color: var(--card-border-hover);
        }
        .action-pill-danger {
          color: #be123c;
        }
        .action-pill-danger:hover {
          background: var(--danger-bg);
          color: var(--danger);
          border-color: var(--danger-border);
        }

        /* Mobile Header */
        .mobile-header {
          display: none;
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border);
          padding: 0.75rem 1rem;
          align-items: center;
          justify-content: space-between;
        }
        .icon-btn-rounded {
          background: #ffffff;
          border: 1px solid var(--border);
          color: var(--foreground);
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .icon-btn-rounded:hover {
          background: var(--bg-inset);
          border-color: var(--card-border-hover);
        }
        .user-avatar-sm {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: linear-gradient(135deg, #4f46e5, #06b6d4);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
          text-decoration: none;
        }

        /* Mobile Drawer */
        .mobile-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 99;
          display: flex;
        }
        .mobile-drawer {
          width: 290px;
          max-width: 85vw;
          height: 100%;
          background: #ffffff;
          border-right: 1px solid var(--border);
          padding: 1.25rem 1rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow-y: auto;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
          animation: slideInLeft 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }

        .dash-main {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
        }

        /* Responsive Breakpoints */
        @media (max-width: 1023px) {
          .dash-shell { flex-direction: column; }
          .desktop-sidebar { display: none; }
          .mobile-header { display: flex; }
        }
      `}</style>
    </div>
  );
}
