"use client";

import { useState, useEffect } from "react";
import { X, Sliders, Shield, Globe, Clock, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { storageApi, type StorageBucketItem } from "@/lib/api";

interface CreateBucketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (bucket: StorageBucketItem) => void;
}

export function CreateBucketModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateBucketModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const res = await storageApi.createBucket({
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
      });
      toast.success(`Bucket '${res.bucket.name}' created successfully.`);
      setName("");
      setDescription("");
      setIsPublic(false);
      onSuccess(res.bucket);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create bucket");
    } finally {
      setLoading(false);
    }
  };

  return (
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
      onClick={onClose}
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
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Create New Storage Bucket</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Buckets are top-level isolated containers for storing and organizing files.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              Bucket Name
            </label>
            <input
              type="text"
              required
              pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="e.g. user-avatars or project-assets"
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-inset)",
                fontSize: "0.85rem",
              }}
            />
            <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
              Lowercase alphanumeric characters and hyphens only (3-63 chars).
            </span>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Profile photos and brand identity assets"
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-inset)",
                fontSize: "0.85rem",
              }}
            />
          </div>

          <div
            style={{
              padding: "0.75rem",
              background: "var(--bg-inset)",
              borderRadius: "0.5rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Public Bucket</div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                Files are publicly readable via CDN URL without authentication tokens.
              </div>
            </div>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ fontSize: "0.85rem" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn btn-primary"
              style={{ fontSize: "0.85rem" }}
            >
              {loading ? "Creating..." : "Create Bucket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface BucketSettingsModalProps {
  bucket: StorageBucketItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BucketSettingsModal({
  bucket,
  isOpen,
  onClose,
  onSuccess,
}: BucketSettingsModalProps) {
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<string>("");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState("");
  const [corsOrigins, setCorsOrigins] = useState("");
  const [corsMaxAge, setCorsMaxAge] = useState(3600);
  const [trashRetentionDays, setTrashRetentionDays] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bucket) {
      setDescription(bucket.description || "");
      setIsPublic(bucket.isPublic);
      setMaxFileSizeMb(
        bucket.maxFileSize ? String(Math.round(Number(bucket.maxFileSize) / (1024 * 1024))) : ""
      );
      setAllowedMimeTypes((bucket.allowedMimeTypes || []).join(", "));
      setCorsOrigins((bucket.corsOrigins || ["*"]).join(", "));
      setCorsMaxAge(bucket.corsMaxAge || 3600);
      setTrashRetentionDays(bucket.trashRetentionDays ?? 30);
    }
  }, [bucket]);

  if (!isOpen || !bucket) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const mimeArray = allowedMimeTypes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const originsArray = corsOrigins
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const maxBytes = maxFileSizeMb.trim()
        ? parseInt(maxFileSizeMb.trim(), 10) * 1024 * 1024
        : undefined;

      await storageApi.updateBucket(bucket.id, {
        description: description.trim() || undefined,
        isPublic,
        allowedMimeTypes: mimeArray,
        corsOrigins: originsArray.length > 0 ? originsArray : ["*"],
        corsMaxAge: corsMaxAge || 3600,
        maxFileSize: maxBytes,
        trashRetentionDays: trashRetentionDays || 30,
      });

      toast.success(`Bucket '${bucket.name}' settings updated successfully.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update bucket settings");
    } finally {
      setSaving(false);
    }
  };

  return (
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
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 520,
          padding: "1.5rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sliders className="w-4 h-4 text-indigo-500" />
            Bucket Settings: {bucket.name}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Configure security, lifecycle retention, file size constraints, and CORS headers.
        </p>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Storage bucket for user documents"
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

          <div
            style={{
              padding: "0.75rem",
              background: "var(--bg-inset)",
              borderRadius: "0.5rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Public Read Access</div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                When enabled, assets are readable anonymously via global Edge CDN.
              </div>
            </div>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Max Single File Size (MB)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxFileSizeMb}
                onChange={(e) => setMaxFileSizeMb(e.target.value)}
                placeholder="e.g. 25"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  background: "var(--bg-inset)",
                  fontSize: "0.85rem",
                }}
              />
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Empty = system limit</span>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Trash Retention (Days)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={trashRetentionDays}
                onChange={(e) => setTrashRetentionDays(parseInt(e.target.value, 10) || 30)}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  background: "var(--bg-inset)",
                  fontSize: "0.85rem",
                }}
              />
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Auto-purge cutoff</span>
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              Allowed MIME Types (Comma-separated)
            </label>
            <input
              type="text"
              value={allowedMimeTypes}
              onChange={(e) => setAllowedMimeTypes(e.target.value)}
              placeholder="e.g. image/png, image/jpeg, application/pdf (Leave empty for all)"
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-inset)",
                fontSize: "0.85rem",
                fontFamily: "monospace",
              }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              CORS Allowed Origins
            </label>
            <input
              type="text"
              value={corsOrigins}
              onChange={(e) => setCorsOrigins(e.target.value)}
              placeholder="e.g. *, https://app.example.com"
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-inset)",
                fontSize: "0.85rem",
                fontFamily: "monospace",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ fontSize: "0.85rem" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ fontSize: "0.85rem" }}
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
