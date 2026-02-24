/**
 * apps/web/src/App.jsx
 * 
 * The web app. Uses @codescan/core for AI review logic
 * and @codescan/ui for shared components.
 * 
 * This same UI is wrapped by apps/desktop (Electron) 
 * and apps/mobile (Capacitor) — no changes needed!
 */

import { useState } from "react";
import { reviewCode, checkOnlineStatus, STANDARDS, LANGUAGE_LABELS } from "@codescan/core";
import { ScoreRing, IssueCard } from "@codescan/ui";

export default function App() {
  const [code, setCode] = useState(`function getUserData(userId) {
  const user = database.find(userId);
  console.log("Fetching user: " + userId);
  
  let result = "";
  for(let i = 0; i < user.permissions.length; i++) {
    result = result + user.permissions[i] + ",";
  }
  
  const password = "admin123";
  const query = "SELECT * FROM users WHERE id = " + userId;
  
  return user.name + " has permissions: " + result;
}`);
  const [language, setLanguage] = useState("JavaScript");
  const [selectedStandards, setSelectedStandards] = useState(["solid", "null_safety", "owasp", "error_handling"]);
  const [customRules, setCustomRules] = useState("");
  const [mode, setMode] = useState("auto");
  const [status, setStatus] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showStandards, setShowStandards] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const toggleStandard = (id) =>
    setSelectedStandards(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );

  const runReview = async () => {
    setReviewing(true);
    setResult(null);
    setError(null);
    setStatus("");
    try {
      const review = await reviewCode(
        { code, language, standards: selectedStandards, customRules },
        { mode, onStatus: setStatus }
      );
      setResult(review);
    } catch (e) {
      setError(e.message);
    } finally {
      setReviewing(false);
      setStatus("");
    }
  };

  const criticalCount = result?.issues?.filter(i => i.severity === "Critical").length || 0;
  const warningCount  = result?.issues?.filter(i => i.severity === "Warning").length || 0;
  const suggestionCount = result?.issues?.filter(i => i.severity === "Suggestion").length || 0;
  const scoreColor = result ? (result.score >= 80 ? "#4ade80" : result.score >= 60 ? "#ffb347" : "#ff4d4d") : "#4db8ff";

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0f",
      fontFamily: "'JetBrains Mono', monospace", color: "#e2e8f0",
      display: "flex", flexDirection: "column"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
        .btn-primary { background: linear-gradient(135deg, #4db8ff, #a855f7); border: none; color: white;
          font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 800; letter-spacing: 1px;
          padding: 13px 32px; border-radius: 6px; cursor: pointer; text-transform: uppercase;
          transition: all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 30px rgba(77,184,255,0.3); }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px;
          border-radius: 20px; cursor: pointer; font-size: 11px; transition: all 0.12s;
          border: 1px solid transparent; user-select: none; }
        .chip.on  { background: rgba(77,184,255,0.12); border-color: rgba(77,184,255,0.35); color: #4db8ff; }
        .chip.off { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); color: #555; }
        .chip:hover { border-color: rgba(77,184,255,0.3); color: #7dd3fc; }
        textarea.code { width:100%; background:#0d0d15; border:1px solid #1e1e2e; color:#c9d1d9;
          font-family:'JetBrains Mono',monospace; font-size:13px; line-height:1.7; padding:16px 16px 16px 48px;
          resize:vertical; border-radius:6px; outline:none; min-height:300px; }
        textarea.code:focus { border-color: rgba(77,184,255,0.4); }
        select, textarea.custom { background:#111118; border:1px solid #1e1e2e; color:#e2e8f0;
          padding:9px 12px; border-radius:6px; font-family:'JetBrains Mono',monospace;
          font-size:13px; outline:none; }
        select:focus, textarea.custom:focus { border-color: rgba(77,184,255,0.4); }
        .fade-in { animation: fi 0.35s ease-out; }
        @keyframes fi { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        .grid-bg { position:fixed; inset:0; pointer-events:none; z-index:0;
          background-image: linear-gradient(rgba(77,184,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(77,184,255,0.025) 1px, transparent 1px);
          background-size: 40px 40px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .label { font-size:10px; color:#555; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:7px; display:block; }
      `}</style>

      <div className="grid-bg" />

      {/* ── Header ── */}
      <header style={{
        borderBottom: "1px solid #1a1a2e", padding: "14px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(10,10,15,0.92)", backdropFilter: "blur(10px)",
        position: "sticky", top: 0, zIndex: 100
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, background: "linear-gradient(135deg,#4db8ff,#a855f7)",
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
          }}>⚡</div>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, letterSpacing: "-0.5px" }}>
              CODE<span style={{ color: "#4db8ff" }}>SCAN</span>
            </div>
            <div style={{ fontSize: 9, color: "#333", letterSpacing: "2px", textTransform: "uppercase" }}>
              AI Code Review · {LANGUAGE_LABELS.length}+ Languages
            </div>
          </div>
        </div>

        {/* Engine Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#444" }}>ENGINE:</span>
          {["auto","cloud","local"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "5px 12px", borderRadius: 4, border: "1px solid",
              borderColor: mode === m ? "rgba(77,184,255,0.5)" : "#1e1e2e",
              background: mode === m ? "rgba(77,184,255,0.1)" : "transparent",
              color: mode === m ? "#4db8ff" : "#444",
              fontSize: 11, cursor: "pointer", textTransform: "uppercase",
              fontFamily: "'JetBrains Mono',monospace", transition: "all 0.15s"
            }}>
              {m === "auto" ? "🔄 Auto" : m === "cloud" ? "☁️ Cloud" : "🖥️ Local"}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main Layout ── */}
      <main style={{ flex: 1, display: "flex", position: "relative", zIndex: 1 }}>

        {/* Left: Input */}
        <div style={{
          width: "52%", padding: "22px 24px", borderRight: "1px solid #1a1a2e",
          display: "flex", flexDirection: "column", gap: 18
        }}>

          {/* Language + Standards row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div>
              <span className="label">Language</span>
              <select value={language} onChange={e => setLanguage(e.target.value)}>
                {LANGUAGE_LABELS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span className="label">Standards ({selectedStandards.length} active)</span>
              <div onClick={() => setShowStandards(!showStandards)} style={{
                background: "#111118", border: "1px solid #1e1e2e", borderRadius: 6,
                padding: "9px 12px", cursor: "pointer", fontSize: 12,
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <span style={{ color: selectedStandards.length ? "#4db8ff" : "#444" }}>
                  {STANDARDS.filter(s => selectedStandards.includes(s.id)).map(s => `${s.icon} ${s.label}`).join("  ·  ") || "Select standards..."}
                </span>
                <span style={{ color: "#333", fontSize: 10, flexShrink: 0, marginLeft: 8 }}>{showStandards ? "▲" : "▼"}</span>
              </div>
            </div>
          </div>

          {/* Standards picker */}
          {showStandards && (
            <div style={{ background:"#111118", border:"1px solid #1e1e2e", borderRadius:8, padding:14 }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {STANDARDS.map(s => (
                  <span key={s.id} className={`chip ${selectedStandards.includes(s.id) ? "on" : "off"}`}
                    onClick={() => toggleStandard(s.id)}>
                    {s.icon} {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Custom rules toggle */}
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom: showCustom ? 8 : 0 }}
              onClick={() => setShowCustom(!showCustom)}>
              <span style={{ fontSize:10, color:"#555", letterSpacing:"1.5px", textTransform:"uppercase" }}>
                + Custom Rules (optional)
              </span>
              <span style={{ fontSize:10, color:"#333" }}>{showCustom ? "▲" : "▼"}</span>
            </div>
            {showCustom && (
              <textarea className="custom" value={customRules} onChange={e => setCustomRules(e.target.value)}
                rows={3} style={{ width:"100%", resize:"vertical" }}
                placeholder="e.g. All functions must have JSDoc comments. No console.log in production code..."
              />
            )}
          </div>

          {/* Code editor */}
          <div style={{ flex: 1 }}>
            <span className="label">Code · {code.split('\n').length} lines</span>
            <div style={{ position: "relative" }}>
              <div style={{
                position:"absolute", left:0, top:0, bottom:0, width:36,
                background:"#0a0a12", borderRadius:"6px 0 0 6px",
                borderRight:"1px solid #1e1e2e", padding:"16px 0",
                pointerEvents:"none", overflow:"hidden"
              }}>
                {code.split('\n').map((_, i) => (
                  <div key={i} style={{
                    height:"1.7em", display:"flex", alignItems:"center",
                    justifyContent:"flex-end", paddingRight:8,
                    fontSize:11, color:"#2a2a3a", fontFamily:"'JetBrains Mono',monospace"
                  }}>{i+1}</div>
                ))}
              </div>
              <textarea className="code" value={code} onChange={e => setCode(e.target.value)}
                spellCheck={false}
                placeholder={`// Paste your ${language} code here...`} />
            </div>
          </div>

          {status && (
            <div style={{ fontSize:11, color:"#4db8ff", display:"flex", alignItems:"center", gap:8 }}>
              <span className="spin" style={{ display:"inline-block" }}>⚡</span> {status}
            </div>
          )}

          <button className="btn-primary" onClick={runReview}
            disabled={reviewing || !code.trim() || !selectedStandards.length}>
            {reviewing ? "Analyzing..." : "⚡ Analyze Code"}
          </button>
        </div>

        {/* Right: Results */}
        <div style={{ width:"48%", padding:"22px 24px", overflowY:"auto", maxHeight:"calc(100vh - 65px)" }}>

          {!result && !reviewing && (
            <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, opacity:0.35 }}>
              <div style={{ fontSize:48 }}>🔍</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, color:"#333" }}>Awaiting Review</div>
              <div style={{ fontSize:12, color:"#333", textAlign:"center", maxWidth:240 }}>
                Paste code · select standards · choose engine · hit Analyze
              </div>
            </div>
          )}

          {reviewing && (
            <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
              <div style={{ width:70, height:70, border:"3px solid #1e1e2e", borderTopColor:"#4db8ff", borderRadius:"50%" }} className="spin" />
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700 }}>Reviewing...</div>
              <div style={{ fontSize:11, color:"#444" }}>{language} · {selectedStandards.length} standards</div>
            </div>
          )}

          {error && (
            <div style={{ background:"rgba(255,77,77,0.08)", border:"1px solid rgba(255,77,77,0.2)", borderRadius:8, padding:18, color:"#ff4d4d", fontSize:13 }}>
              ⚠️ {error}
            </div>
          )}

          {result && (
            <div className="fade-in" style={{ display:"flex", flexDirection:"column", gap:18 }}>

              {/* Score */}
              <div style={{ background:"#0e0e1a", border:"1px solid #1e1e2e", borderRadius:12, padding:"18px 22px", display:"flex", alignItems:"center", gap:20 }}>
                <ScoreRing score={result.score} size={88} />
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, marginBottom:7, color:scoreColor }}>
                    {result.score>=80 ? "✅ Solid Code" : result.score>=60 ? "⚠️ Needs Work" : "🔴 Critical Issues"}
                  </div>
                  <div style={{ fontSize:12, color:"#888", lineHeight:1.6, marginBottom:10 }}>{result.summary}</div>
                  <div style={{ display:"flex", gap:18 }}>
                    {[["Critical",criticalCount,"#ff4d4d"],["Warning",warningCount,"#ffb347"],["Suggestion",suggestionCount,"#4db8ff"]].map(([l,c,col]) => (
                      <div key={l} style={{ textAlign:"center" }}>
                        <div style={{ fontSize:20, fontFamily:"'Syne',sans-serif", fontWeight:800, color:col }}>{c}</div>
                        <div style={{ fontSize:9, color:"#444", letterSpacing:"1px", textTransform:"uppercase" }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:8, fontSize:10, color:"#333" }}>
                    Engine: {result.engine === "cloud" ? "☁️ Claude API" : "🖥️ Local (Ollama)"}
                  </div>
                </div>
              </div>

              {/* Strengths */}
              {result.strengths?.length > 0 && (
                <div style={{ background:"rgba(74,222,128,0.05)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:8, padding:"12px 16px" }}>
                  <div style={{ fontSize:10, color:"#4ade80", letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:9, fontWeight:600 }}>✓ Strengths</div>
                  {result.strengths.map((s,i) => (
                    <div key={i} style={{ fontSize:12, color:"#6ee7a0", marginBottom:3, paddingLeft:8 }}>· {s}</div>
                  ))}
                </div>
              )}

              {/* Issues */}
              <div>
                <div style={{ fontSize:10, color:"#555", letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:10, fontWeight:600 }}>
                  Issues · {result.issues?.length || 0} found
                </div>
                {result.issues?.length === 0
                  ? <div style={{ textAlign:"center", color:"#4ade80", fontSize:13, padding:"16px 0" }}>🎉 No issues found!</div>
                  : result.issues.map(issue => <IssueCard key={issue.id} issue={issue} />)
                }
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
