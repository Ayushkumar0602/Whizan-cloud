"use client";

import { useState, useEffect } from "react";
import {
  Zap,
  Plus,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Lock,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import {
  storageApi,
  type StorageBucketItem,
  type StorageWebhookItem,
} from "@/lib/api";

interface StorageWebhooksProps {
  buckets: StorageBucketItem[];
}

export function StorageWebhooks({ buckets }: StorageWebhooksProps) {
  const [webhooks, setWebhooks] = useState<StorageWebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedBucketId, setSelectedBucketId] = useState<string>("ALL");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "OBJECT_UPLOAD",
    "OBJECT_DELETE",
  ]);
  const [secret, setSecret] = useState("");
  const [creating, setCreating] = useState(false);

  const loadWebhooks = async () => {
    setLoading(true);
    try {
      const data = await storageApi.listWebhooks();
      setWebhooks(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success("Secret copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || selectedEvents.length === 0) return;

    setCreating(true);
    try {
      await storageApi.createWebhook({
        url: url.trim(),
        bucketId: selectedBucketId === "ALL" ? null : selectedBucketId,
        events: selectedEvents,
        secret: secret.trim() || undefined,
      });

      toast.success("Webhook endpoint registered successfully.");
      setModalOpen(false);
      setUrl("");
      setSecret("");
      await loadWebhooks();
    } catch (err: any) {
      toast.error(err.message || "Failed to create webhook");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteWebhook = async (webhook: StorageWebhookItem) => {
    if (!confirm(`Delete webhook pointing to '${webhook.url}'?`)) return;

    try {
      await storageApi.deleteWebhook(webhook.id);
      toast.success("Webhook deleted.");
      setWebhooks((prev) => prev.filter((w) => w.id !== webhook.id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete webhook");
    }
  };

  const toggleEvent = (ev: string) => {
    setSelectedEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Header Card */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Zap className="w-4 h-4 text-amber-500" />
            Storage Event Webhooks
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>
            Real-time HTTP POST notifications dispatched when files are uploaded or deleted. Signed via HMAC-SHA256.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={loadWebhooks}
            className="btn btn-secondary"
            style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="btn btn-primary"
            style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Plus className="w-4 h-4" />
            Register Webhook
          </button>
        </div>
      </div>

      {/* Webhooks Table Card */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
        }}
      >
        {loading ? (
          <div style={{ padding: "4rem 0", textAlign: "center", color: "var(--muted)" }}>
            Loading webhook endpoints...
          </div>
        ) : webhooks.length === 0 ? (
          <div
            style={{
              padding: "4rem 2rem",
              textAlign: "center",
              border: "1px dashed var(--border)",
              borderRadius: "0.5rem",
              background: "var(--bg-inset)",
            }}
          >
            <Zap className="w-8 h-8 text-slate-400" style={{ margin: "0 auto 0.5rem" }} />
            <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>No webhooks registered</p>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Configure an HTTPS endpoint to receive event payloads on file uploads, deletions, and bucket lifecycle triggers.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="btn btn-secondary"
              style={{ marginTop: "1rem", fontSize: "0.8rem" }}
            >
              Add First Webhook
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Endpoint URL</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Scope</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Subscribed Events</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Secret Key</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => {
                  const bucket = buckets.find((b) => b.id === w.bucketId);
                  return (
                    <tr key={w.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                      <td style={{ padding: "0.6rem" }}>
                        <div style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--foreground)" }}>
                          {w.url}
                        </div>
                      </td>
                      <td style={{ padding: "0.6rem", color: "var(--muted)" }}>
                        {bucket ? bucket.name : "All Buckets"}
                      </td>
                      <td style={{ padding: "0.6rem" }}>
                        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                          {w.events.map((ev) => (
                            <span
                              key={ev}
                              style={{
                                fontSize: "0.65rem",
                                fontWeight: 700,
                                padding: "0.1rem 0.4rem",
                                borderRadius: 4,
                                background: ev.includes("DELETE")
                                  ? "rgba(225, 29, 72, 0.15)"
                                  : "rgba(16, 185, 129, 0.15)",
                                color: ev.includes("DELETE")
                                  ? "var(--danger)"
                                  : "var(--success)",
                              }}
                            >
                              {ev}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "0.6rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--muted)" }}>
                            whz_wh_••••••••
                          </span>
                          <button
                            onClick={() => copyToClipboard(w.secret, w.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}
                            title="Copy Signing Secret"
                          >
                            {copiedKey === w.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 hover:text-indigo-400" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: "0.6rem", textAlign: "right" }}>
                        <button
                          onClick={() => handleDeleteWebhook(w)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--muted)",
                            cursor: "pointer",
                            padding: "0.25rem",
                          }}
                          title="Delete Webhook"
                        >
                          <Trash2 className="w-4 h-4 hover:text-rose-500" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Developer HMAC Verification Snippet Card */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div>
            <h4 style={{ fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              HMAC Signature Verification (X-Whizan-Signature)
            </h4>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              Whizan attaches an HMAC-SHA256 signature header to every dispatch. Validate the signature to prevent spoofing.
            </p>
          </div>
        </div>

        <pre
          style={{
            padding: "1rem",
            background: "var(--bg-inset)",
            borderRadius: "0.5rem",
            border: "1px solid var(--border)",
            fontSize: "0.8rem",
            fontFamily: "monospace",
            overflowX: "auto",
            margin: 0,
            color: "var(--foreground)",
          }}
        >{`// Node.js Express / Fastify verification
import crypto from "crypto";

export function verifyWebhook(req, res, next) {
  const signature = req.headers["x-whizan-signature"];
  const secret = process.env.WHIZAN_WEBHOOK_SECRET;
  
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: "Invalid HMAC signature" });
  }
  next();
}`}</pre>
      </div>

      {/* Create Webhook Modal */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "1.5rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.4rem" }}>Register Webhook</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Configure an HTTPS endpoint to receive event updates.
            </p>

            <form onSubmit={handleCreateWebhook}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Destination URL
                </label>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.my-app.com/webhooks/storage"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Scope to Bucket
                </label>
                <select
                  value={selectedBucketId}
                  onChange={(e) => setSelectedBucketId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="ALL">All Buckets (Global)</option>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Subscribed Events
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  {["OBJECT_UPLOAD", "OBJECT_DELETE", "BUCKET_CREATE", "BUCKET_DELETE"].map((ev) => (
                    <label
                      key={ev}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(ev)}
                        onChange={() => toggleEvent(ev)}
                      />
                      <span>{ev}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Signing Secret (Optional)
                </label>
                <input
                  type="text"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Auto-generated if left blank"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.85rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !url.trim() || selectedEvents.length === 0}
                  className="btn btn-primary"
                  style={{ fontSize: "0.85rem" }}
                >
                  {creating ? "Saving..." : "Register Webhook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
