"use client";

import { useState, useEffect } from "react";
import {
  Key,
  RotateCcw,
  Plus,
  Trash2,
  Search,
  Eye,
  Clock,
  Check,
  Copy,
  X,
  Database,
  Layers,
  Code2,
} from "lucide-react";
import {
  databases,
  type ManagedDatabase,
  type RedisKeyItem,
  type RedisKeyDetail,
} from "@/lib/api";

interface Props {
  database: ManagedDatabase;
  onOpenCli?: (cmd: string) => void;
}

export default function DatabaseRedisExplorer({ database, onOpenCli }: Props) {
  const [keys, setKeys] = useState<RedisKeyItem[]>([]);
  const [totalKeys, setTotalKeys] = useState(0);
  const [pattern, setPattern] = useState("*");
  const [loading, setLoading] = useState(true);

  // Selected key detail
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyDetail, setKeyDetail] = useState<RedisKeyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Set Key modal
  const [showSetModal, setShowSetModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newTtl, setNewTtl] = useState<number | undefined>(undefined);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  async function loadKeys(p = pattern) {
    setLoading(true);
    try {
      const res = await databases.getRedisKeys(database.id, p);
      setKeys(res.keys || []);
      setTotalKeys(res.totalKeys || 0);
      if (res.keys && res.keys.length > 0 && !selectedKey) {
        inspectKey(res.keys[0].key);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function inspectKey(keyName: string) {
    setSelectedKey(keyName);
    setDetailLoading(true);
    try {
      const detail = await databases.getRedisKey(database.id, keyName);
      setKeyDetail(detail);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadKeys();
  }, [database.id]);

  async function handleDeleteKey(keyName: string) {
    if (!confirm(`Delete Redis key "${keyName}"?`)) return;
    try {
      await databases.deleteRedisKey(database.id, keyName);
      if (selectedKey === keyName) {
        setSelectedKey(null);
        setKeyDetail(null);
      }
      loadKeys();
    } catch (err: any) {
      alert(err.message || "Failed to delete key");
    }
  }

  async function handleSetKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim()) {
      setModalError("Key name is required");
      return;
    }
    setModalLoading(true);
    setModalError(null);
    try {
      await databases.setRedisKey(database.id, newKey.trim(), newValue, newTtl);
      setShowSetModal(false);
      setNewKey("");
      setNewValue("");
      setNewTtl(undefined);
      await loadKeys();
      inspectKey(newKey.trim());
    } catch (err: any) {
      setModalError(err.message || "Failed to set key");
    } finally {
      setModalLoading(false);
    }
  }

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedCell(id);
    setTimeout(() => setCopiedCell(null), 1500);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: "1.25rem",
        minHeight: 600,
      }}
    >
      {/* ── LEFT: KEYS LIST ─────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1rem",
            background: "var(--bg-inset)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Key size={15} style={{ color: "#ef4444" }} />
              Redis Keyspace ({totalKeys})
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <button
              onClick={() => loadKeys()}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "4px 6px",
                color: "var(--muted)",
                cursor: "pointer",
              }}
              title="Refresh"
            >
              <RotateCcw size={12} />
            </button>

            <button
              onClick={() => {
                setShowSetModal(true);
                setModalError(null);
              }}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: "0.75rem",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                cursor: "pointer",
              }}
            >
              <Plus size={12} />
              Set Key
            </button>
          </div>
        </div>

        {/* Pattern Search */}
        <div style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadKeys(pattern);
            }}
            style={{ display: "flex", gap: "0.4rem" }}
          >
            <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
              <Search size={13} style={{ position: "absolute", left: 8, color: "var(--muted)" }} />
              <input
                type="text"
                placeholder="MATCH pattern (e.g. * or user:*)"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.35rem 0.5rem 0.35rem 1.75rem",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  fontSize: "0.8rem",
                  color: "var(--foreground)",
                  outline: "none",
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: "0.35rem 0.6rem",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                fontSize: "0.78rem",
                color: "var(--foreground)",
                cursor: "pointer",
              }}
            >
              Scan
            </button>
          </form>
        </div>

        {/* Keys List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
          {loading ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
              <div className="spinner" style={{ margin: "0 auto 0.5rem", width: 18, height: 18 }} />
              Scanning keys...
            </div>
          ) : keys.length === 0 ? (
            <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--muted)", fontSize: "0.8rem" }}>
              No keys found matching &quot;{pattern}&quot;.
              <br />
              Click <strong>+ Set Key</strong> to create one.
            </div>
          ) : (
            keys.map((k) => {
              const isSelected = k.key === selectedKey;
              return (
                <button
                  key={k.key}
                  onClick={() => inspectKey(k.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.55rem 0.65rem",
                    borderRadius: 6,
                    border: isSelected ? "1px solid var(--accent)" : "1px solid transparent",
                    background: isSelected ? "rgba(99, 102, 241, 0.12)" : "transparent",
                    color: isSelected ? "var(--accent)" : "var(--foreground)",
                    textAlign: "left",
                    cursor: "pointer",
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0 }}>
                    <Key size={13} style={{ flexShrink: 0, opacity: isSelected ? 1 : 0.5 }} />
                    <span
                      style={{
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: "0.82rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: "monospace",
                      }}
                    >
                      {k.key}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "2px 5px",
                      borderRadius: 4,
                      background: "var(--bg-inset)",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    {k.type}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT: KEY INSPECTOR & ACTIONS ───────────────────────────── */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {selectedKey ? (
          <>
            {/* Header */}
            <div
              style={{
                padding: "1rem 1.25rem",
                background: "var(--bg-inset)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#ef4444",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Key size={18} />
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <code
                      style={{
                        fontSize: "1rem",
                        fontWeight: 700,
                        color: "var(--foreground)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selectedKey}
                    </code>
                    {keyDetail && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--accent)",
                          textTransform: "uppercase",
                        }}
                      >
                        {keyDetail.type}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>
                    TTL: {keyDetail?.ttl === -1 ? "Persistent (no expiry)" : `${keyDetail?.ttl}s remaining`}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {onOpenCli && (
                  <button
                    onClick={() => onOpenCli(`GET "${selectedKey}"`)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.4rem 0.75rem",
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: "0.8rem",
                      color: "var(--foreground)",
                      cursor: "pointer",
                    }}
                  >
                    <Code2 size={13} />
                    CLI
                  </button>
                )}

                <button
                  onClick={() => handleDeleteKey(selectedKey)}
                  style={{
                    padding: "0.4rem 0.6rem",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 6,
                    color: "#ef4444",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                  title="Delete key"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Value Body */}
            <div style={{ padding: "1.25rem", flex: 1, overflowY: "auto" }}>
              {detailLoading ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
                  <div className="spinner" style={{ margin: "0 auto 1rem", width: 22, height: 22 }} />
                  Fetching value...
                </div>
              ) : keyDetail ? (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Value Payload</span>
                    <button
                      onClick={() =>
                        copyText(
                          typeof keyDetail.value === "object"
                            ? JSON.stringify(keyDetail.value, null, 2)
                            : String(keyDetail.value),
                          "val"
                        )
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.75rem",
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        color: "var(--foreground)",
                        cursor: "pointer",
                      }}
                    >
                      {copiedCell === "val" ? <Check size={12} style={{ color: "#10b981" }} /> : <Copy size={12} />}
                      Copy Value
                    </button>
                  </div>

                  <pre
                    style={{
                      padding: "1rem",
                      background: "#090d16",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.85rem",
                      color: "#93c5fd",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      maxHeight: 460,
                    }}
                  >
                    {typeof keyDetail.value === "object"
                      ? JSON.stringify(keyDetail.value, null, 2)
                      : String(keyDetail.value)}
                  </pre>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div style={{ padding: "4rem", textAlign: "center", color: "var(--muted)" }}>
            <Key size={40} style={{ margin: "0 auto 1rem", opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>Select a key to view value or click &quot;Set Key&quot;.</p>
          </div>
        )}
      </div>

      {/* ── MODAL: SET REDIS KEY ─────────────────────────────────────── */}
      {showSetModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius)",
              width: "100%",
              maxWidth: 520,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Set Redis Key</h3>
              <button
                onClick={() => setShowSetModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSetKeySubmit} style={{ padding: "1.25rem" }}>
              {modalError && (
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 4,
                    color: "#ef4444",
                    fontSize: "0.85rem",
                    marginBottom: "1rem",
                  }}
                >
                  {modalError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                    Key Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. app:session:123 or config:theme"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.55rem",
                      borderRadius: 6,
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                    Value String / JSON
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Value string or JSON payload"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.55rem",
                      borderRadius: 6,
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                    TTL Expiration (Optional Seconds)
                  </label>
                  <input
                    type="number"
                    placeholder="Leave empty for persistent key (no expiration)"
                    value={newTtl ?? ""}
                    onChange={(e) =>
                      setNewTtl(e.target.value ? parseInt(e.target.value, 10) : undefined)
                    }
                    style={{
                      width: "100%",
                      padding: "0.55rem",
                      borderRadius: 6,
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: "1.5rem",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.6rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowSetModal(false)}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: 6,
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: 6,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: modalLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {modalLoading ? "Saving..." : "Set Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
