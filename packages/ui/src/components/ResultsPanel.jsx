import ScoreRing from "./ScoreRing.jsx";
import IssueCard from "./IssueCard.jsx";

export default function ResultsPanel({ result, reviewing, error }) {
  if (reviewing) return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 60, height: 60, border: "3px solid #1e1e2e", borderTopColor: "#4db8ff", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700 }}>Reviewing...</div>
    </div>
  );

  if (error) return (
    <div style={{ background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: 8, padding: 18, color: "#ff4d4d", fontSize: 13 }}>
      ⚠️ {error}
    </div>
  );

  if (!result) return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, opacity: 0.35 }}>
      <div style={{ fontSize: 48 }}>🔍</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color: "#333" }}>Awaiting Review</div>
      <div style={{ fontSize: 12, color: "#333", textAlign: "center", maxWidth: 240 }}>Paste code · select standards · hit Analyze</div>
    </div>
  );

  const scoreColor = result.score >= 80 ? "#4ade80" : result.score >= 60 ? "#ffb347" : "#ff4d4d";
  const critical   = result.issues?.filter(i => i.severity === "Critical").length || 0;
  const warning    = result.issues?.filter(i => i.severity === "Warning").length || 0;
  const suggestion = result.issues?.filter(i => i.severity === "Suggestion").length || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, animation: "fadeIn 0.35s ease-out" }}>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }`}</style>

      {/* Score */}
      <div style={{ background: "#0e0e1a", border: "1px solid #1e1e2e", borderRadius: 12, padding: "18px 22px", display: "flex", alignItems: "center", gap: 20 }}>
        <ScoreRing score={result.score} size={88} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 7, color: scoreColor }}>
            {result.score >= 80 ? "✅ Solid Code" : result.score >= 60 ? "⚠️ Needs Work" : "🔴 Critical Issues"}
          </div>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6, marginBottom: 10 }}>{result.summary}</div>
          <div style={{ display: "flex", gap: 18 }}>
            {[["Critical", critical, "#ff4d4d"], ["Warning", warning, "#ffb347"], ["Suggestion", suggestion, "#4db8ff"]].map(([l, c, col]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontFamily: "'Syne',sans-serif", fontWeight: 800, color: col }}>{c}</div>
                <div style={{ fontSize: 9, color: "#444", letterSpacing: "1px", textTransform: "uppercase" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: "#333" }}>
            Engine: {result.engine === "cloud" ? "☁️ Claude API" : "🖥️ Local (Ollama)"}
          </div>
        </div>
      </div>

      {/* Strengths */}
      {result.strengths?.length > 0 && (
        <div style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 8, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 9, fontWeight: 600 }}>✓ Strengths</div>
          {result.strengths.map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: "#6ee7a0", marginBottom: 3, paddingLeft: 8 }}>· {s}</div>
          ))}
        </div>
      )}

      {/* Issues */}
      <div>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>
          Issues · {result.issues?.length || 0} found
        </div>
        {result.issues?.length === 0
          ? <div style={{ textAlign: "center", color: "#4ade80", fontSize: 13, padding: "16px 0" }}>🎉 No issues found!</div>
          : result.issues.map(issue => <IssueCard key={issue.id} issue={issue} />)
        }
      </div>
    </div>
  );
}