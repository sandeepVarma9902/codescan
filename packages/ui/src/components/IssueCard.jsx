/**
 * IssueCard — expandable issue display
 * Used in web, desktop, and mobile results
 */
import { useState } from "react";

const SEV = {
  Critical:   { color: "#ff4d4d", bg: "rgba(255,77,77,0.08)",  border: "rgba(255,77,77,0.25)",  dot: "🔴" },
  Warning:    { color: "#ffb347", bg: "rgba(255,179,71,0.08)", border: "rgba(255,179,71,0.25)", dot: "🟡" },
  Suggestion: { color: "#4db8ff", bg: "rgba(77,184,255,0.08)", border: "rgba(77,184,255,0.25)", dot: "🔵" },
};

export default function IssueCard({ issue }) {
  const [open, setOpen] = useState(false);
  const sev = SEV[issue.severity] || SEV.Suggestion;

  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        background: open ? sev.bg : "rgba(255,255,255,0.02)",
        border: `1px solid ${open ? sev.border : "#1e1e2e"}`,
        borderRadius: 8, marginBottom: 10,
        cursor: "pointer", transition: "all 0.15s",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{sev.dot}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 3,
              background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`,
              fontWeight: 600, letterSpacing: "0.5px"
            }}>{issue.severity}</span>
            <span style={{ fontSize: 10, color: "#555", letterSpacing: "1px" }}>{issue.category}</span>
            <span style={{ fontSize: 10, color: "#333", marginLeft: "auto" }}>{issue.line_reference}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#d1d5db", marginBottom: 4 }}>{issue.title}</div>
          <div style={{ fontSize: 11, color: "#666", lineHeight: 1.5 }}>{issue.problem}</div>
        </div>
        <span style={{ color: "#333", fontSize: 12, flexShrink: 0, marginTop: 2 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${sev.border}` }}>
          {issue.improved_code && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: "#4db8ff", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>
                📌 Improved Code
              </div>
              <pre style={{
                background: "#0d1117", border: "1px solid rgba(77,184,255,0.2)",
                borderLeft: "3px solid #4db8ff", borderRadius: 4, padding: 12,
                fontSize: 12, lineHeight: 1.6, color: "#c9d1d9",
                whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{issue.improved_code}</pre>
            </div>
          )}
          {issue.explanation && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#6ee7a0", lineHeight: 1.6 }}>
              💡 {issue.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
