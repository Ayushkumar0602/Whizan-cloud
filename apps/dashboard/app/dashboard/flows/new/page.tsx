"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Workflow,
  ArrowLeft,
  Sparkles,
  Layers,
  Shield,
  Check,
  Zap,
  Sliders,
  Clock,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { flowsApi } from "@/lib/api";
import { PRESET_FLOW_TEMPLATES, type FlowTemplateDef } from "@/lib/flow-templates";

export default function NewWorkflowPage() {
  const router = useRouter();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("nextjs-edge-canary");
  const [isCustom, setIsCustom] = useState<boolean>(false);

  const [name, setName] = useState("Zero-Downtime Next.js Edge Cutover");
  const [slug, setSlug] = useState("nextjs-edge-canary");
  const [category, setCategory] = useState("BUILD_DEPLOY");
  const [description, setDescription] = useState(
    "Automated analysis, standalone build, canary health verification, atomic Edge Router cutover, and Slack notification."
  );
  const [concurrencyPolicy, setConcurrencyPolicy] = useState<"QUEUE" | "FORBID" | "ALLOW" | "REPLACE">("QUEUE");
  const [timeoutSeconds, setTimeoutSeconds] = useState(900);
  const [submitting, setSubmitting] = useState(false);

  const handleSelectTemplate = (tmpl: FlowTemplateDef) => {
    setIsCustom(false);
    setSelectedTemplateId(tmpl.id);
    setName(tmpl.name);
    setSlug(`${tmpl.slug}-${Math.random().toString(36).slice(2, 6)}`);
    setCategory(tmpl.category);
    setDescription(tmpl.description);
    setConcurrencyPolicy(tmpl.concurrencyPolicy);
    setTimeoutSeconds(tmpl.timeoutSeconds);
  };

  const handleSelectCustom = () => {
    setIsCustom(true);
    setSelectedTemplateId("");
    setName("Custom Automation Pipeline");
    setSlug(`custom-pipeline-${Math.random().toString(36).slice(2, 6)}`);
    setCategory("BUILD_DEPLOY");
    setDescription("Custom DAG workflow created from scratch.");
    setConcurrencyPolicy("QUEUE");
    setTimeoutSeconds(600);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    const generated = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    setSlug(`${generated}-${Math.random().toString(36).slice(2, 6)}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please provide a workflow name");
      return;
    }

    setSubmitting(true);
    try {
      let initialNodes: any[] = [];
      let initialEdges: any[] = [];

      if (!isCustom) {
        const tmpl = PRESET_FLOW_TEMPLATES.find((t) => t.id === selectedTemplateId);
        if (tmpl) {
          initialNodes = tmpl.nodes;
          initialEdges = tmpl.edges;
        }
      } else {
        // Starter blank canvas with a single manual trigger
        initialNodes = [
          {
            nodeKey: "trigger_start",
            name: "Manual Start",
            type: "TRIGGER_MANUAL",
            config: {},
            positionX: 100,
            positionY: 200,
          },
        ];
      }

      const created = await flowsApi.create({
        name,
        slug,
        category,
        description,
        concurrencyPolicy,
        timeoutSeconds: Number(timeoutSeconds) || 600,
        nodes: initialNodes,
        edges: initialEdges,
      });

      toast.success("Pipeline created successfully!");
      router.push(`/dashboard/flows/${created.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create workflow");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 920, margin: "0 auto", padding: "1.75rem 1.25rem 4rem" }}>
      {/* Back button */}
      <Link
        href="/dashboard/flows"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          fontSize: "0.82rem",
          color: "var(--muted)",
          marginBottom: "1rem",
        }}
      >
        <ArrowLeft size={14} />
        Back to Whizan Flow
      </Link>

      <PageHeader
        title="Create New Pipeline"
        subtitle="Configure triggers, execution policies, and choose a production blueprint"
      />

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.75rem", marginTop: "1.5rem" }}>
        {/* Step 1: Template Selection */}
        <div className="card" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Sparkles size={16} style={{ color: "var(--accent)" }} />
            <h3 style={{ fontSize: "1rem", fontWeight: 650 }}>1. Choose a Blueprint</h3>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
            Select an enterprise-tested architecture or start with a clean blank canvas.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "0.85rem",
            }}
          >
            {PRESET_FLOW_TEMPLATES.map((tmpl) => {
              const selected = !isCustom && selectedTemplateId === tmpl.id;
              return (
                <div
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  style={{
                    padding: "1rem",
                    borderRadius: 10,
                    border: "1.5px solid",
                    borderColor: selected ? "var(--accent)" : "var(--border)",
                    background: selected ? "var(--accent-glow)" : "var(--bg-inset)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "0.6rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                      <span
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 600,
                          padding: "0.1rem 0.4rem",
                          borderRadius: 4,
                          background: "#f1f5f9",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)",
                        }}
                      >
                        {tmpl.badge}
                      </span>
                      {selected && <Check size={14} style={{ color: "var(--accent)" }} />}
                    </div>
                    <div style={{ fontSize: "0.86rem", fontWeight: 650, color: "var(--foreground)" }}>
                      {tmpl.name}
                    </div>
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                    {tmpl.nodes.length} pre-wired steps
                  </span>
                </div>
              );
            })}

            {/* Custom Blank Canvas Card */}
            <div
              onClick={handleSelectCustom}
              style={{
                padding: "1rem",
                borderRadius: 10,
                border: "1.5px solid",
                borderColor: isCustom ? "var(--accent)" : "var(--border)",
                background: isCustom ? "var(--accent-glow)" : "var(--bg-inset)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "0.6rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      padding: "0.1rem 0.4rem",
                      borderRadius: 4,
                      background: "#f1f5f9",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                    }}
                  >
                    SCRATCH
                  </span>
                  {isCustom && <Check size={14} style={{ color: "var(--accent)" }} />}
                </div>
                <div style={{ fontSize: "0.86rem", fontWeight: 650, color: "var(--foreground)" }}>
                  Blank Canvas
                </div>
              </div>
              <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                Build custom DAG manually
              </span>
            </div>
          </div>
        </div>

        {/* Step 2: Pipeline Configuration */}
        <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sliders size={16} style={{ color: "var(--accent)" }} />
            <h3 style={{ fontSize: "1rem", fontWeight: 650 }}>2. Pipeline Configuration</h3>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 550, marginBottom: "0.4rem" }}>
                Pipeline Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--foreground)",
                  fontSize: "0.86rem",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 550, marginBottom: "0.4rem" }}>
                Unique Slug
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--foreground)",
                  fontSize: "0.86rem",
                  fontFamily: "monospace",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 550, marginBottom: "0.4rem" }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: "100%",
                padding: "0.6rem 0.8rem",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--foreground)",
                fontSize: "0.86rem",
                outline: "none",
              }}
            >
              <option value="BUILD_DEPLOY">Build & Deploy</option>
              <option value="CI_CD">CI/CD & Testing</option>
              <option value="EDGE_OPS">Edge Routing & Operations</option>
              <option value="SECURITY">Security & Vulnerability Scanning</option>
              <option value="CRON_MAINTENANCE">Scheduled Maintenance</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 550, marginBottom: "0.4rem" }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                padding: "0.6rem 0.8rem",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--foreground)",
                fontSize: "0.84rem",
                outline: "none",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 550, marginBottom: "0.4rem" }}>
                Concurrency Policy
              </label>
              <select
                value={concurrencyPolicy}
                onChange={(e) => setConcurrencyPolicy(e.target.value as any)}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--foreground)",
                  fontSize: "0.86rem",
                  outline: "none",
                }}
              >
                <option value="QUEUE">QUEUE (Enqueues subsequent runs sequentially)</option>
                <option value="FORBID">FORBID (Disallows trigger if already running)</option>
                <option value="ALLOW">ALLOW (Unrestricted concurrent execution)</option>
                <option value="REPLACE">REPLACE (Terminates previous active run)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 550, marginBottom: "0.4rem" }}>
                Execution Timeout (Seconds)
              </label>
              <input
                type="number"
                min={30}
                max={7200}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--foreground)",
                  fontSize: "0.86rem",
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>

        {/* Action button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.75rem" }}>
          <Link href="/dashboard/flows" className="btn btn-secondary">
            Cancel
          </Link>
          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ padding: "0.65rem 1.4rem" }}>
            <span>{submitting ? "Creating Pipeline..." : "Create Pipeline & Open Canvas"}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}
