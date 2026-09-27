"use client";

import { useEffect, useState } from "react";
import { github, type GitHubRepo } from "@/lib/api";
import {
  Github,
  Lock,
  Globe,
  Search,
  RefreshCw,
  Check,
  GitBranch,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Unplug
} from "lucide-react";
import { toast } from "sonner";

export interface SelectedRepoInfo {
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  branches: string[];
  isPrivate: boolean;
  owner: string;
}

export interface GitHubRepoPickerProps {
  onSelectRepo: (info: SelectedRepoInfo) => void;
  selectedUrl?: string;
  selectedBranch?: string;
  onBranchChange?: (branch: string) => void;
}

export function GitHubRepoPicker({
  onSelectRepo,
  selectedUrl,
  selectedBranch,
  onBranchChange,
}: GitHubRepoPickerProps) {
  const [status, setStatus] = useState<{
    connected: boolean;
    username?: string;
    avatarUrl?: string;
    name?: string;
  } | null>(null);

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "private" | "public">("all");

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  // Check connection status on load
  const checkStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await github.getStatus();
      setStatus(res);
      if (res.connected) {
        fetchRepos();
      }
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchRepos = async () => {
    setLoadingRepos(true);
    try {
      const list = await github.getRepos();
      setRepos(list);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch GitHub repositories");
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  // Connect GitHub
  const handleConnect = async () => {
    try {
      const { url } = await github.getAuthUrl();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate GitHub OAuth");
    }
  };

  // Disconnect GitHub
  const handleDisconnect = async () => {
    if (!confirm("Disconnect GitHub account?")) return;
    try {
      await github.disconnect();
      setStatus({ connected: false });
      setRepos([]);
      setSelectedRepo(null);
      toast.success("GitHub disconnected");
    } catch {
      toast.error("Failed to disconnect GitHub");
    }
  };

  // Select a repository
  const handleSelect = async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setLoadingBranches(true);

    let branchList = [repo.defaultBranch || "main"];
    try {
      const bRes = await github.getBranches(repo.owner, repo.name);
      if (Array.isArray(bRes) && bRes.length > 0) {
        branchList = bRes;
      }
    } catch {} finally {
      setLoadingBranches(false);
    }

    setBranches(branchList);

    onSelectRepo({
      name: repo.name,
      fullName: repo.fullName,
      cloneUrl: repo.cloneUrl || repo.htmlUrl,
      defaultBranch: repo.defaultBranch || "main",
      branches: branchList,
      isPrivate: repo.private,
      owner: repo.owner,
    });
  };

  // Filter repos based on search & tab filter
  const filteredRepos = repos.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(search.toLowerCase()));

    if (filter === "private") return matchesSearch && r.private;
    if (filter === "public") return matchesSearch && !r.private;
    return matchesSearch;
  });

  if (loadingStatus) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
        <RefreshCw size={18} className="spin-icon" style={{ marginBottom: "0.5rem" }} />
        <p style={{ fontSize: "0.85rem" }}>Checking GitHub connection...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.85rem 1.15rem",
          background: "var(--bg-inset)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        {status?.connected ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {status.avatarUrl ? (
              <img
                src={status.avatarUrl}
                alt={status.username}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)" }}
              />
            ) : (
              <Github size={20} className="text-accent" />
            )}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, fontSize: "0.9rem" }}>
                <span>@{status.username || status.name}</span>
                <span className="badge badge-success" style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}>
                  <ShieldCheck size={11} /> Connected
                </span>
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.1rem" }}>
                Full access to public & private repositories
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Github size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Connect GitHub</div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                Authorize 1-click deployments for public and private repositories
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {status?.connected ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={fetchRepos}
                disabled={loadingRepos}
                title="Refresh Repositories"
              >
                <RefreshCw size={13} className={loadingRepos ? "spin-icon" : ""} /> Refresh
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setManualMode(!manualMode)}
              >
                {manualMode ? "Select from GitHub" : "Paste URL Manually"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm text-danger"
                onClick={handleDisconnect}
                title="Disconnect Account"
              >
                <Unplug size={13} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConnect}
                style={{ gap: "0.5rem" }}
              >
                <Github size={16} /> Authorize GitHub
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setManualMode(!manualMode)}
              >
                {manualMode ? "Connect Account" : "Paste URL Manually"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Manual Mode or Connected Repo Picker */}
      {manualMode || !status?.connected ? (
        <div
          style={{
            padding: "1.25rem",
            background: "var(--bg-inset)",
            border: "1px dashed var(--border)",
            borderRadius: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
              Manual Git Repository URL
            </span>
            {!status?.connected && (
              <button
                type="button"
                onClick={handleConnect}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  fontWeight: 600,
                }}
              >
                <Github size={13} /> Or connect GitHub to select private repos
              </button>
            )}
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
            Paste any HTTPS Git clone URL (e.g., <code>https://github.com/username/repository</code>).
          </p>
        </div>
      ) : (
        /* GitHub Repos Selector */
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Controls: Search & Filter Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted)",
                }}
              />
              <input
                type="text"
                className="input"
                placeholder="Search repositories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: "2.2rem", fontSize: "0.85rem", height: "36px" }}
              />
            </div>

            <div style={{ display: "flex", background: "var(--bg-inset)", padding: "2px", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <button
                type="button"
                className={`btn btn-sm ${filter === "all" ? "btn-secondary" : ""}`}
                style={{ fontSize: "0.78rem", padding: "0.25rem 0.65rem", border: "none" }}
                onClick={() => setFilter("all")}
              >
                All ({repos.length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${filter === "private" ? "btn-secondary" : ""}`}
                style={{ fontSize: "0.78rem", padding: "0.25rem 0.65rem", border: "none" }}
                onClick={() => setFilter("private")}
              >
                Private ({repos.filter((r) => r.private).length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${filter === "public" ? "btn-secondary" : ""}`}
                style={{ fontSize: "0.78rem", padding: "0.25rem 0.65rem", border: "none" }}
                onClick={() => setFilter("public")}
              >
                Public ({repos.filter((r) => !r.private).length})
              </button>
            </div>
          </div>

          {/* Repository List Grid */}
          {loadingRepos ? (
            <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--muted)" }}>
              <RefreshCw size={18} className="spin-icon" style={{ marginBottom: "0.5rem" }} />
              <p style={{ fontSize: "0.85rem" }}>Loading your repositories...</p>
            </div>
          ) : filteredRepos.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--muted)",
                fontSize: "0.85rem",
              }}
            >
              No repositories found matching "{search}".
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: "0.75rem",
                maxHeight: "340px",
                overflowY: "auto",
                paddingRight: "0.25rem",
              }}
            >
              {filteredRepos.map((repo) => {
                const isSelected = selectedRepo?.id === repo.id || selectedUrl === repo.cloneUrl || selectedUrl === repo.htmlUrl;
                return (
                  <div
                    key={repo.id}
                    onClick={() => handleSelect(repo)}
                    style={{
                      padding: "0.85rem 1rem",
                      background: isSelected ? "rgba(56, 189, 248, 0.08)" : "var(--bg-inset)",
                      border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                    }}
                    className="repo-picker-card"
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {repo.fullName}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        {repo.private ? (
                          <span
                            className="badge"
                            style={{
                              background: "rgba(245, 158, 11, 0.12)",
                              color: "#f59e0b",
                              borderColor: "rgba(245, 158, 11, 0.3)",
                              fontSize: "0.7rem",
                              padding: "0.15rem 0.45rem",
                            }}
                          >
                            <Lock size={10} /> Private
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              background: "rgba(16, 185, 129, 0.12)",
                              color: "#10b981",
                              borderColor: "rgba(16, 185, 129, 0.3)",
                              fontSize: "0.7rem",
                              padding: "0.15rem 0.45rem",
                            }}
                          >
                            <Globe size={10} /> Public
                          </span>
                        )}
                        {isSelected && <Check size={16} className="text-accent" />}
                      </div>
                    </div>

                    {repo.description && (
                      <p
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--muted)",
                          margin: 0,
                          lineHeight: 1.3,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {repo.description}
                      </p>
                    )}

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "0.75rem",
                        color: "var(--muted)",
                        marginTop: "0.2rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        {repo.language && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background:
                                  repo.language === "TypeScript"
                                    ? "#3178c6"
                                    : repo.language === "JavaScript"
                                    ? "#f7df1e"
                                    : repo.language === "Python"
                                    ? "#3572A5"
                                    : repo.language === "Go"
                                    ? "#00ADD8"
                                    : "#a855f7",
                              }}
                            />
                            {repo.language}
                          </span>
                        )}
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                          <GitBranch size={12} /> {repo.defaultBranch}
                        </span>
                      </div>
                      <span>Updated {new Date(repo.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Branch Dropdown selector if repository is selected */}
          {selectedRepo && branches.length > 0 && onBranchChange && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.85rem 1rem",
                background: "rgba(56, 189, 248, 0.05)",
                border: "1px solid rgba(56, 189, 248, 0.2)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <GitBranch size={16} className="text-accent" />
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Branch to deploy:</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <select
                  className="input mono"
                  value={selectedBranch || selectedRepo.defaultBranch}
                  onChange={(e) => onBranchChange(e.target.value)}
                  style={{ fontSize: "0.82rem", height: "32px", width: "160px" }}
                  disabled={loadingBranches}
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                {loadingBranches && <RefreshCw size={13} className="spin-icon" />}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
