"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownViewProps {
  content: string;
}

// Design tokens matching the dark Summer drawer
const M = {
  text: "#e2e8f0",
  textSecondary: "#94a3b8",
  textBold: "#f8fafc",
  accent: "#6366f1",
  bgCode: "#0c0f1a",
  bgCodeHeader: "#111528",
  border: "rgba(255, 255, 255, 0.06)",
  bgTable: "rgba(255, 255, 255, 0.02)",
  bgTableHeader: "rgba(255, 255, 255, 0.04)",
  bgTableStripe: "rgba(255, 255, 255, 0.02)",
  success: "#10b981",
  link: "#818cf8",
};

export function MarkdownView({ content }: MarkdownViewProps) {
  const elements = parseMarkdownBlocks(content);
  return <div>{elements}</div>;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: "8px",
        overflow: "hidden",
        border: `1px solid ${M.border}`,
        background: M.bgCode,
        fontSize: "0.76rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 10px",
          background: M.bgCodeHeader,
          borderBottom: `1px solid ${M.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#ef4444", opacity: 0.7 }} />
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#f59e0b", opacity: 0.7 }} />
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", opacity: 0.7 }} />
          </div>
          <span style={{ fontSize: "0.65rem", color: M.textSecondary, fontFamily: "monospace", textTransform: "uppercase", marginLeft: "4px" }}>
            {language || "code"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy Code"
          style={{
            display: "flex", alignItems: "center", gap: "4px",
            background: "transparent", border: "none",
            color: copied ? M.success : M.textSecondary,
            fontSize: "0.68rem", cursor: "pointer", padding: "2px 6px", borderRadius: "4px",
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre
        style={{
          margin: 0, padding: "10px 12px", overflowX: "auto",
          color: M.text,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          lineHeight: 1.5,
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function parseMarkdownBlocks(text: string): React.ReactNode[] {
  if (!text) return [];

  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced Code Block
    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push(<CodeBlock key={`code-${i}`} code={codeLines.join("\n")} language={language} />);
      continue;
    }

    // Markdown Table
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      nodes.push(renderTable(tableLines, `table-${i}`));
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      nodes.push(
        <h4 key={`h4-${i}`} style={{ fontSize: "0.88rem", fontWeight: 700, margin: "10px 0 4px", color: M.textBold }}>
          {renderInline(line.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(
        <h3 key={`h3-${i}`} style={{ fontSize: "0.95rem", fontWeight: 700, margin: "12px 0 6px", color: M.textBold }}>
          {renderInline(line.slice(3))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(
        <h2 key={`h2-${i}`} style={{ fontSize: "1.05rem", fontWeight: 800, margin: "14px 0 6px", color: M.textBold }}>
          {renderInline(line.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    // Lists
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        listItems.push(lines[i].trim().slice(2));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} style={{ margin: "6px 0", paddingLeft: "18px", fontSize: "0.82rem", color: M.text }}>
          {listItems.map((item, idx) => (
            <li key={idx} style={{ margin: "2px 0" }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered lists
    if (/^\d+\.\s/.test(line.trim())) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} style={{ margin: "6px 0", paddingLeft: "20px", fontSize: "0.82rem", color: M.text }}>
          {listItems.map((item, idx) => (
            <li key={idx} style={{ margin: "2px 0" }}>
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.trim().startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      nodes.push(
        <blockquote
          key={`bq-${i}`}
          style={{
            margin: "6px 0", padding: "6px 12px",
            borderLeft: `3px solid ${M.accent}`,
            background: "rgba(99, 102, 241, 0.05)",
            color: M.textSecondary, fontSize: "0.82rem",
            borderRadius: "0 6px 6px 0",
          }}
        >
          {quoteLines.map((l, idx) => (
            <p key={idx} style={{ margin: "2px 0" }}>{renderInline(l)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular Paragraph
    nodes.push(
      <p key={`p-${i}`} style={{ margin: "5px 0", fontSize: "0.82rem", lineHeight: 1.6, color: M.text }}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return nodes;
}

function renderTable(lines: string[], key: string): React.ReactNode {
  if (lines.length < 2) return null;

  const headerCells = lines[0]
    .split("|")
    .map((c) => c.trim())
    .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

  const dataRows = lines.slice(2).map((row) =>
    row
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
  );

  return (
    <div
      key={key}
      style={{
        margin: "8px 0", borderRadius: "8px", overflowX: "auto",
        border: `1px solid ${M.border}`, background: M.bgTable,
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
        <thead>
          <tr style={{ background: M.bgTableHeader, borderBottom: `1px solid ${M.border}` }}>
            {headerCells.map((cell, idx) => (
              <th
                key={idx}
                style={{
                  textAlign: "left", padding: "7px 10px",
                  fontWeight: 600, color: M.textSecondary,
                }}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              style={{
                borderBottom: rowIdx === dataRows.length - 1 ? "none" : `1px solid ${M.border}`,
                background: rowIdx % 2 === 1 ? M.bgTableStripe : "transparent",
              }}
            >
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} style={{ padding: "7px 10px", color: M.text }}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Parses inline formatting: **bold**, `code`, [links](url)
 */
function renderInline(text: string): React.ReactNode {
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} style={{ fontWeight: 700, color: M.textBold }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          style={{
            background: "rgba(99, 102, 241, 0.12)",
            color: M.link,
            padding: "1px 5px", borderRadius: "4px",
            fontSize: "0.76rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontWeight: 500,
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
      const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        return (
          <a
            key={idx}
            href={match[2]}
            style={{ color: M.link, textDecoration: "underline", fontWeight: 500 }}
            target={match[2].startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
          >
            {match[1]}
          </a>
        );
      }
    }
    return part;
  });
}
