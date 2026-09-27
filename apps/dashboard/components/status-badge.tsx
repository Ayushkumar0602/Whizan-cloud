import { AlertCircle, CheckCircle2, Clock, Loader2, PauseCircle, XCircle } from "lucide-react";

const CONFIG: Record<
  string,
  { cls: string; label: string; Icon: typeof CheckCircle2 }
> = {
  READY: { cls: "badge-ready", label: "Ready", Icon: CheckCircle2 },
  BUILDING: { cls: "badge-building", label: "Building", Icon: Loader2 },
  QUEUED: { cls: "badge-queued", label: "Queued", Icon: Clock },
  FAILED: { cls: "badge-failed", label: "Failed", Icon: XCircle },
  CANCELLED: { cls: "badge-failed", label: "Cancelled", Icon: AlertCircle },
  PAUSED: { cls: "badge-paused", label: "Paused", Icon: PauseCircle },
};

export function StatusBadge({ status }: { status: string }) {
  const c = CONFIG[status] || CONFIG.QUEUED;
  const spinning = status === "BUILDING";
  const isReady = status === "READY";

  return (
    <span className={`badge ${c.cls}`}>
      {isReady ? (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "#10b981",
            boxShadow: "0 0 6px #10b981",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
      ) : (
        <c.Icon size={12} className={spinning ? "spin-icon" : undefined} style={{ flexShrink: 0 }} />
      )}
      <span>{c.label}</span>
    </span>
  );
}
