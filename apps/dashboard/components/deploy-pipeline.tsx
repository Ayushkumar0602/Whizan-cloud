import {
  PIPELINE_STEPS,
  getPipelineSteps,
  pipelineHeadline,
  pipelineStateFor,
} from "@/lib/pipeline";
import { Check, AlertCircle, Loader2 } from "lucide-react";

export function DeployPipeline({
  status,
  logs = [],
  compact = false,
  legend = false,
  isDirectUpload = false,
}: {
  status?: string;
  logs?: string[];
  compact?: boolean;
  legend?: boolean;
  isDirectUpload?: boolean;
}) {
  const steps = getPipelineSteps(isDirectUpload);
  const headline = legend
    ? {
        title: "Every frontend follows this path",
        body: "When a deploy starts, this tracker lights up so you always know the current step.",
      }
    : pipelineHeadline(status, logs, isDirectUpload);

  return (
    <div className={`pipeline ${compact ? "pipeline-compact" : ""}`}>
      {!compact && (
        <div className="pipeline-now">
          <div className="pipeline-now-kicker">{legend ? "Deploy path" : "Where you are"}</div>
          <div className="pipeline-now-title">{headline.title}</div>
          <p className="pipeline-now-body">{headline.body}</p>
        </div>
      )}
      <ol className="pipeline-track">
        {steps.map((step, i) => {
          const state = pipelineStateFor(step.id, status, logs);
          return (
            <li key={step.id} className={`pipeline-step pipeline-step-${state}`}>
              <div className="pipeline-node-wrapper">
                <div className="pipeline-node" aria-hidden>
                  {state === "done" ? (
                    <Check size={13} strokeWidth={3} />
                  ) : state === "failed" ? (
                    <AlertCircle size={13} strokeWidth={3} />
                  ) : state === "current" ? (
                    <Loader2 size={13} className="spin-icon" />
                  ) : (
                    i + 1
                  )}
                </div>
                {i < steps.length - 1 && <span className="pipeline-line" />}
              </div>
              <div className="pipeline-copy">
                <div className="pipeline-label">{step.label}</div>
                {!compact && <div className="pipeline-hint">{step.hint}</div>}
              </div>
            </li>
          );
        })}
      </ol>

      <style>{`
        .pipeline {
          background: var(--card-bg, rgba(15, 23, 42, 0.6));
          border: 1px solid var(--card-border, rgba(255, 255, 255, 0.08));
          border-radius: 12px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 1.5rem;
        }
        .pipeline-compact {
          padding: 0.75rem 1rem;
          margin-bottom: 0;
          background: transparent;
          border: none;
        }

        .pipeline-now {
          margin-bottom: 1.25rem;
          padding-bottom: 0.85rem;
          border-bottom: 1px solid var(--card-border, rgba(255, 255, 255, 0.08));
        }
        .pipeline-now-kicker {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent, #6366f1);
          margin-bottom: 0.2rem;
        }
        .pipeline-now-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--foreground, #f8fafc);
        }
        .pipeline-now-body {
          font-size: 0.78rem;
          color: var(--muted, #94a3b8);
          margin-top: 0.15rem;
        }

        .pipeline-track {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          list-style: none;
          padding: 0;
          margin: 0;
          gap: 0.5rem;
          overflow-x: auto;
        }
        .pipeline-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          flex: 1;
          min-width: 90px;
          position: relative;
        }
        .pipeline-node-wrapper {
          display: flex;
          align-items: center;
          width: 100%;
          position: relative;
          justify-content: center;
          margin-bottom: 0.5rem;
        }
        .pipeline-node {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          z-index: 2;
          background: var(--bg-inset, #0f172a);
          border: 2px solid var(--card-border, rgba(255, 255, 255, 0.2));
          color: var(--muted, #94a3b8);
          transition: all 0.2s ease;
        }
        .pipeline-line {
          position: absolute;
          left: 50%;
          right: -50%;
          top: 50%;
          height: 2px;
          background: var(--card-border, rgba(255, 255, 255, 0.12));
          transform: translateY(-50%);
          z-index: 1;
        }

        /* Step States */
        .pipeline-step-done .pipeline-node {
          background: #10b981;
          border-color: #10b981;
          color: #ffffff;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
        }
        .pipeline-step-done .pipeline-line {
          background: #10b981;
        }

        .pipeline-step-current .pipeline-node {
          background: rgba(99, 102, 241, 0.2);
          border-color: var(--accent, #6366f1);
          color: var(--accent, #6366f1);
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
        }
        .pipeline-step-current .pipeline-label {
          color: var(--accent, #6366f1);
          font-weight: 700;
        }

        .pipeline-step-failed .pipeline-node {
          background: #f43f5e;
          border-color: #f43f5e;
          color: #ffffff;
        }

        .pipeline-copy {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .pipeline-label {
          font-size: 0.8rem;
          font-weight: 650;
          color: var(--foreground, #f8fafc);
        }
        .pipeline-hint {
          font-size: 0.7rem;
          color: var(--muted, #94a3b8);
          margin-top: 0.15rem;
          line-height: 1.2;
        }

        @media (max-width: 640px) {
          .pipeline-track {
            flex-direction: column;
            align-items: flex-start;
          }
          .pipeline-step {
            flex-direction: row;
            text-align: left;
            gap: 0.75rem;
            width: 100%;
          }
          .pipeline-node-wrapper {
            width: auto;
            margin-bottom: 0;
          }
          .pipeline-line {
            display: none;
          }
          .pipeline-copy {
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}

export function WizardSteps({
  steps,
  current,
}: {
  steps: { id: string; label: string; hint: string }[];
  current: number;
}) {
  return (
    <div className="wizard-container">
      <ol className="wizard-track">
        {steps.map((step, i) => {
          const state = i < current ? "done" : i === current ? "current" : "pending";
          return (
            <li key={step.id} className={`wizard-step wizard-step-${state}`}>
              <div className="wizard-index-wrapper">
                <div className="wizard-index">
                  {i < current ? <Check size={12} strokeWidth={3} /> : i + 1}
                </div>
                {i < steps.length - 1 && <span className="wizard-line" />}
              </div>
              <div className="wizard-info">
                <div className="wizard-label">{step.label}</div>
                <div className="wizard-hint">{step.hint}</div>
              </div>
            </li>
          );
        })}
      </ol>

      <style>{`
        .wizard-container {
          width: 100%;
        }
        .wizard-track {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          list-style: none;
          padding: 0;
          margin: 0;
          gap: 0.5rem;
        }
        .wizard-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          flex: 1;
          position: relative;
        }
        .wizard-index-wrapper {
          display: flex;
          align-items: center;
          width: 100%;
          position: relative;
          justify-content: center;
          margin-bottom: 0.45rem;
        }
        .wizard-index {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          z-index: 2;
          background: var(--bg-inset, #0f172a);
          border: 2px solid var(--card-border, rgba(255, 255, 255, 0.2));
          color: var(--muted, #94a3b8);
          transition: all 0.2s ease;
        }
        .wizard-line {
          position: absolute;
          left: 50%;
          right: -50%;
          top: 50%;
          height: 2px;
          background: var(--card-border, rgba(255, 255, 255, 0.12));
          transform: translateY(-50%);
          z-index: 1;
        }

        .wizard-step-done .wizard-index {
          background: var(--accent, #6366f1);
          border-color: var(--accent, #6366f1);
          color: #ffffff;
        }
        .wizard-step-done .wizard-line {
          background: var(--accent, #6366f1);
        }

        .wizard-step-current .wizard-index {
          background: rgba(99, 102, 241, 0.15);
          border-color: var(--accent, #6366f1);
          color: var(--accent, #6366f1);
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
        }
        .wizard-step-current .wizard-label {
          color: var(--accent, #6366f1);
          font-weight: 700;
        }

        .wizard-info {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .wizard-label {
          font-size: 0.8rem;
          font-weight: 650;
          color: var(--foreground, #f8fafc);
        }
        .wizard-hint {
          font-size: 0.72rem;
          color: var(--muted, #94a3b8);
          margin-top: 0.1rem;
        }

        @media (max-width: 640px) {
          .wizard-track {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
          .wizard-step {
            flex-direction: row;
            text-align: left;
            gap: 0.75rem;
            width: 100%;
          }
          .wizard-index-wrapper {
            width: auto;
            margin-bottom: 0;
          }
          .wizard-line {
            display: none;
          }
          .wizard-info {
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}

