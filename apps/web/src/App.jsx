/**
 * apps/web/src/App.jsx
 * CodeScan — Single file + Project folder review
 */

import { useState, useRef } from "react";
import { reviewCode, STANDARDS, LANGUAGE_LABELS, detectLanguageFromExt } from "@codescan/core";
import { ScoreRing, IssueCard } from "@codescan/ui";
import MipsChat from "./MipsChat.jsx";

// File extensions to include in project scan
const SUPPORTED_EXTENSIONS = [
  ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".go", ".rs",
  ".cpp", ".c", ".cs", ".rb", ".php", ".swift", ".kt", ".vue",
  ".svelte", ".sql", ".sh", ".bash", ".scala", ".r", ".dart"
];

const IGNORED_DIRS = ["node_modules", ".git", "dist", "build", ".next", "out", "coverage", ".turbo"];

const SAMPLE_CODE = `function getUserData(userId) {
  const user = database.find(userId);
  console.log("Fetching user: " + userId);
  
  let result = "";
  for(let i = 0; i < user.permissions.length; i++) {
    result = result + user.permissions[i] + ",";
  }
  
  const password = "admin123";
  const query = "SELECT * FROM users WHERE id = " + userId;
  
  return user.name + " has permissions: " + result;
}`;

export default function App() {
  // App tab
  const [appTab, setAppTab] = useState("review");

  // Mode: "single" | "project"
  const [mode, setMode] = useState("single");

  // Single file state
  const [code, setCode] = useState(SAMPLE_CODE);
  const [language, setLanguage] = useState("JavaScript");

  // Project state
  const [projectFiles, setProjectFiles] = useState([]);
  const [projectName, setProjectName] = useState("");

  // Shared state
  const [selectedStandards, setSelectedStandards] = useState(["solid", "null_safety", "owasp", "error_handling"]);
  const [engine, setEngine] = useState("auto");
  const [customRules, setCustomRules] = useState("");
  const [showStandards, setShowStandards] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [projectResults, setProjectResults] = useState(null);
  const [error, setError] = useState(null);

  const folderInputRef = useRef(null);

  const toggleStandard = (id) =>
    setSelectedStandards(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );

  // ── Project folder handling ──────────────────────────────────────────────────

  const handleFolderUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    // Get project name from first file's path
    const firstPath = files[0].webkitRelativePath;
    const projName = firstPath.split("/")[0];
    setProjectName(projName);

    // Filter to supported code files, ignore irrelevant dirs
    const codeFiles = files.filter(file => {
      const path = file.webkitRelativePath;
      const parts = path.split("/");
      const isIgnored = parts.some(p => IGNORED_DIRS.includes(p));
      const ext = "." + file.name.split(".").pop().toLowerCase();
      return !isIgnored && SUPPORTED_EXTENSIONS.includes(ext) && file.size < 100000; // skip files > 100KB
    });

    setProjectFiles(codeFiles);
    setResult(null);
    setProjectResults(null);
    setError(null);
  };

  // ── Single file review ───────────────────────────────────────────────────────

  const runSingleReview = async () => {
    setReviewing(true);
    setResult(null);
    setError(null);
    setStatus("");
    try {
      const review = await reviewCode(
        { code, language, standards: selectedStandards, customRules },
        { mode: engine, onStatus: setStatus }
      );
      setResult(review);
    } catch (e) {
      setError(e.message.includes("fetch")
        ? "Server is waking up — please try again in 30 seconds."
        : e.message
      );
    } finally {
      setReviewing(false);
      setStatus("");
    }
  };

  // ── Project review ───────────────────────────────────────────────────────────

  const runProjectReview = async () => {
    if (!projectFiles.length) return;
    setReviewing(true);
    setProjectResults(null);
    setError(null);

    const results = [];
    const allIssues = [];

    try {
      // Step 1: Review each file individually
      for (let i = 0; i < projectFiles.length; i++) {
        const file = projectFiles[i];
        const ext = "." + file.name.split(".").pop().toLowerCase();
        const lang = detectLanguageFromExt(file.name)?.label || "JavaScript";
        const filePath = file.webkitRelativePath;

        setStatus(`Reviewing ${i + 1}/${projectFiles.length}: ${file.name}...`);

        try {
          const fileCode = await file.text();
          const review = await reviewCode(
            { code: fileCode, language: lang, standards: selectedStandards, customRules },
            { mode: engine, onStatus: () => {} }
          );

          results.push({
            file: filePath,
            fileName: file.name,
            language: lang,
            score: review.score,
            summary: review.summary,
            issues: review.issues || [],
            strengths: review.strengths || [],
          });

          // Collect all issues with file reference
          (review.issues || []).forEach(issue => {
            allIssues.push({ ...issue, file: filePath, fileName: file.name });
          });

        } catch (fileErr) {
          results.push({
            file: filePath,
            fileName: file.name,
            language: lang,
            score: null,
            error: fileErr.message,
            issues: [],
          });
        }
      }

      // Step 2: Generate project-level summary
      setStatus("Generating project report...");

      const avgScore = Math.round(
        results.filter(r => r.score !== null).reduce((sum, r) => sum + r.score, 0) /
        results.filter(r => r.score !== null).length
      );

      const criticals   = allIssues.filter(i => i.severity === "Critical");
      const warnings    = allIssues.filter(i => i.severity === "Warning");
      const suggestions = allIssues.filter(i => i.severity === "Suggestion");

      // Group security issues across files
      const securityIssues = allIssues.filter(i =>
        i.category?.toLowerCase().includes("security") ||
        i.category?.toLowerCase().includes("owasp")
      );

      setProjectResults({
        projectName,
        totalFiles: results.length,
        avgScore,
        results,
        allIssues,
        criticals,
        warnings,
        suggestions,
        securityIssues,
        worstFiles: [...results]
          .filter(r => r.score !== null)
          .sort((a, b) => a.score - b.score)
          .slice(0, 3),
        bestFiles: [...results]
          .filter(r => r.score !== null)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3),
      });

    } catch (e) {
      setError(e.message);
    } finally {
      setReviewing(false);
      setStatus("");
    }
  };

  // ── Rendering ────────────────────────────────────────────────────────────────

  const scoreColor = (score) =>
    score >= 80 ? "#4ade80" : score >= 60 ? "#ffb347" : "#ff4d4d";

  const criticalCount   = result?.issues?.filter(i => i.severity === "Critical").length || 0;
  const warningCount    = result?.issues?.filter(i => i.severity === "Warning").length || 0;
  const suggestionCount = result?.issues?.filter(i => i.severity === "Suggestion").length || 0;

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
          transition: all 0.2s; width: 100%; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 30px rgba(77,184,255,0.3); }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px;
          border-radius: 20px; cursor: pointer; font-size: 11px; transition: all 0.12s;
          border: 1px solid transparent; user-select: none; }
        .chip.on  { background: rgba(77,184,255,0.12); border-color: rgba(77,184,255,0.35); color: #4db8ff; }
        .chip.off { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); color: #555; }
        .chip:hover { border-color: rgba(77,184,255,0.3); color: #7dd3fc; }
        textarea.code { width:100%; background:#0d0d15; border:1px solid #1e1e2e; color:#c9d1d9;
          font-family:'JetBrains Mono',monospace; font-size:13px; line-height:1.7;
          padding:16px 16px 16px 48px; resize:vertical; border-radius:6px; outline:none; min-height:280px; }
        textarea.code:focus { border-color: rgba(77,184,255,0.4); }
        select, textarea.custom { background:#111118; border:1px solid #1e1e2e; color:#e2e8f0;
          padding:9px 12px; border-radius:6px; font-family:'JetBrains Mono',monospace; font-size:13px; outline:none; }
        .mode-btn { padding: 8px 20px; border-radius: 6px; border: 1px solid; cursor: pointer;
          font-family: 'Syne', sans-serif; font-weight: 700; font-size: 13px; transition: all 0.15s; }
        .mode-btn.active { background: rgba(77,184,255,0.15); border-color: rgba(77,184,255,0.5); color: #4db8ff; }
        .mode-btn.inactive { background: transparent; border-color: #1e1e2e; color: #444; }
        .drop-zone { border: 2px dashed #1e1e2e; border-radius: 10px; padding: 40px 20px;
          text-align: center; cursor: pointer; transition: all 0.2s; }
        .drop-zone:hover { border-color: rgba(77,184,255,0.4); background: rgba(77,184,255,0.03); }
        .file-pill { display: flex; align-items: center; gap: 8px; padding: 6px 10px;
          background: rgba(255,255,255,0.03); border: 1px solid #1e1e2e; border-radius: 6px;
          font-size: 11px; color: #666; margin-bottom: 4px; }
        .fade-in { animation: fi 0.35s ease-out; }
        @keyframes fi { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        .grid-bg { position:fixed; inset:0; pointer-events:none; z-index:0;
          background-image: linear-gradient(rgba(77,184,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(77,184,255,0.025) 1px, transparent 1px);
          background-size: 40px 40px; }
        .spin { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .label { font-size:10px; color:#555; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:7px; display:block; }
        .file-row { padding: 12px 14px; border-radius: 8px; border: 1px solid #1e1e2e;
          margin-bottom: 8px; cursor: pointer; transition: all 0.15s; }
        .file-row:hover { border-color: rgba(77,184,255,0.3); background: rgba(77,184,255,0.03); }
        .progress-bar { height: 4px; background: #1e1e2e; border-radius: 2px; overflow: hidden; margin-top: 8px; }
        .progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
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
              AI Code Review · 40+ Languages
            </div>
          </div>
        </div>

        {/* Engine selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#444" }}>ENGINE:</span>
          {["auto", "cloud", "local"].map(m => (
            <button key={m} onClick={() => setEngine(m)} style={{
              padding: "5px 12px", borderRadius: 4, border: "1px solid",
              borderColor: engine === m ? "rgba(77,184,255,0.5)" : "#1e1e2e",
              background: engine === m ? "rgba(77,184,255,0.1)" : "transparent",
              color: engine === m ? "#4db8ff" : "#444",
              fontSize: 11, cursor: "pointer", textTransform: "uppercase",
              fontFamily: "'JetBrains Mono',monospace", transition: "all 0.15s"
            }}>
              {m === "auto" ? "🔄 Auto" : m === "cloud" ? "☁️ Cloud" : "🖥️ Local"}
            </button>
          ))}
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a2e", background: "#0a0a0f", padding: "0 24px" }}>
        {[
          { id: "review", label: "⚡ Code Review", desc: "Single file & project scan" },
          { id: "mips",   label: "🏥 MIPS Expert", desc: "CMS measure validation" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setAppTab(tab.id)} style={{
            padding: "12px 20px", border: "none", background: "transparent",
            cursor: "pointer", fontFamily: "'Syne', sans-serif", fontWeight: 700,
            fontSize: 13, transition: "all 0.15s", position: "relative",
            color: appTab === tab.id ? "#4db8ff" : "#444",
            borderBottom: appTab === tab.id ? "2px solid #4db8ff" : "2px solid transparent",
          }}>{tab.label}</button>
        ))}
      </div>

      {appTab === "mips" ? <MipsChat /> : <main style={{ flex: 1, display: "flex", position: "relative", zIndex: 1 }}>

        {/* ── Left Panel ── */}
        <div style={{
          width: "52%", padding: "22px 24px", borderRight: "1px solid #1a1a2e",
          display: "flex", flexDirection: "column", gap: 16
        }}>

          {/* Mode Toggle */}
          <div style={{ display: "flex", gap: 8 }}>
            <button className={`mode-btn ${mode === "single" ? "active" : "inactive"}`}
              onClick={() => { setMode("single"); setProjectResults(null); }}>
              📄 Single File
            </button>
            <button className={`mode-btn ${mode === "project" ? "active" : "inactive"}`}
              onClick={() => { setMode("project"); setResult(null); }}>
              📁 Project Folder
            </button>
          </div>

          {/* Standards */}
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: showStandards ? 8 : 0 }}>
              <span className="label" style={{ margin: 0 }}>Standards ({selectedStandards.length} active)</span>
              <div onClick={() => setShowStandards(!showStandards)} style={{
                background: "#111118", border: "1px solid #1e1e2e", borderRadius: 6,
                padding: "6px 12px", cursor: "pointer", fontSize: 11, flex: 1,
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <span style={{ color: "#4db8ff" }}>
                  {STANDARDS.filter(s => selectedStandards.includes(s.id)).map(s => s.icon).join(" ")}
                </span>
                <span style={{ color: "#333", fontSize: 10 }}>{showStandards ? "▲" : "▼"}</span>
              </div>
            </div>
            {showStandards && (
              <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STANDARDS.map(s => (
                    <span key={s.id} className={`chip ${selectedStandards.includes(s.id) ? "on" : "off"}`}
                      onClick={() => toggleStandard(s.id)}>
                      {s.icon} {s.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── SINGLE FILE MODE ── */}
          {mode === "single" && (
            <>
              <div style={{ display: "flex", gap: 10 }}>
                <div>
                  <span className="label">Language</span>
                  <select value={language} onChange={e => setLanguage(e.target.value)}>
                    {LANGUAGE_LABELS.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <span className="label">Code · {code.split('\n').length} lines</span>
                <div style={{ position: "relative" }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: 36,
                    background: "#0a0a12", borderRadius: "6px 0 0 6px",
                    borderRight: "1px solid #1e1e2e", padding: "16px 0",
                    pointerEvents: "none", overflow: "hidden"
                  }}>
                    {code.split('\n').map((_, i) => (
                      <div key={i} style={{
                        height: "1.7em", display: "flex", alignItems: "center",
                        justifyContent: "flex-end", paddingRight: 8,
                        fontSize: 11, color: "#2a2a3a"
                      }}>{i + 1}</div>
                    ))}
                  </div>
                  <textarea className="code" value={code} onChange={e => setCode(e.target.value)}
                    spellCheck={false} placeholder={`// Paste your ${language} code here...`} />
                </div>
              </div>
            </>
          )}

          {/* ── PROJECT FOLDER MODE ── */}
          {mode === "project" && (
            <>
              <div>
                <span className="label">Project Folder</span>
                <div className="drop-zone" onClick={() => folderInputRef.current?.click()}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📁</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: "#4db8ff", marginBottom: 6 }}>
                    {projectFiles.length ? `${projectName}` : "Click to select project folder"}
                  </div>
                  <div style={{ fontSize: 11, color: "#444" }}>
                    {projectFiles.length
                      ? `${projectFiles.length} code files found — ready to scan`
                      : "Supports JS, TS, Python, Java, Go, Rust, and 30+ more"
                    }
                  </div>
                  <input
                    ref={folderInputRef}
                    type="file"
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={handleFolderUpload}
                    style={{ display: "none" }}
                  />
                </div>
              </div>

              {projectFiles.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  <span className="label">Files to scan ({projectFiles.length})</span>
                  {projectFiles.map((file, i) => (
                    <div key={i} className="file-pill">
                      <span>{detectLanguageFromExt(file.name)?.icon || "📄"}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {file.webkitRelativePath}
                      </span>
                      <span style={{ color: "#333", flexShrink: 0 }}>
                        {(file.size / 1024).toFixed(1)}KB
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Custom rules */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              onClick={() => setShowCustom(!showCustom)}>
              <span style={{ fontSize: 10, color: "#444", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                + Custom Rules (optional)
              </span>
              <span style={{ fontSize: 10, color: "#333" }}>{showCustom ? "▲" : "▼"}</span>
            </div>
            {showCustom && (
              <textarea className="custom" value={customRules} onChange={e => setCustomRules(e.target.value)}
                rows={2} style={{ width: "100%", marginTop: 8, resize: "vertical" }}
                placeholder="e.g. All functions must have JSDoc comments. No console.log in production..." />
            )}
          </div>

          {status && (
            <div style={{ fontSize: 11, color: "#4db8ff", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="spin">⚡</span> {status}
            </div>
          )}

          <button className="btn-primary"
            onClick={mode === "single" ? runSingleReview : runProjectReview}
            disabled={reviewing || (mode === "single" ? !code.trim() : !projectFiles.length) || !selectedStandards.length}>
            {reviewing
              ? mode === "project" ? `⚡ Scanning ${projectFiles.length} files...` : "⚡ Analyzing..."
              : mode === "project" ? `⚡ Scan Project (${projectFiles.length} files)` : "⚡ Analyze Code"
            }
          </button>
        </div>

        {/* ── Right Panel — Results ── */}
        <div style={{ width: "48%", padding: "22px 24px", overflowY: "auto", maxHeight: "calc(100vh - 65px)" }}>

          {/* Empty state */}
          {!result && !projectResults && !reviewing && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, opacity: 0.35 }}>
              <div style={{ fontSize: 48 }}>{mode === "project" ? "📁" : "🔍"}</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color: "#333" }}>
                {mode === "project" ? "Select a Project Folder" : "Awaiting Review"}
              </div>
              <div style={{ fontSize: 12, color: "#333", textAlign: "center", maxWidth: 260 }}>
                {mode === "project"
                  ? "Upload your project folder to get a full security and code quality report"
                  : "Paste code · select standards · hit Analyze"
                }
              </div>
            </div>
          )}

          {/* Loading */}
          {reviewing && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ width: 70, height: 70, border: "3px solid #1e1e2e", borderTopColor: "#4db8ff", borderRadius: "50%" }} className="spin" />
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700 }}>
                {mode === "project" ? "Scanning Project..." : "Reviewing..."}
              </div>
              <div style={{ fontSize: 11, color: "#444", textAlign: "center" }}>{status}</div>
              {mode === "project" && projectFiles.length > 0 && (
                <div style={{ width: 200 }}>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{
                      width: `${(projectResults?.results?.length || 0) / projectFiles.length * 100}%`,
                      background: "linear-gradient(90deg, #4db8ff, #a855f7)"
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: 8, padding: 18, color: "#ff4d4d", fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          {/* ── SINGLE FILE RESULT ── */}
          {result && !projectResults && (
            <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ background: "#0e0e1a", border: "1px solid #1e1e2e", borderRadius: 12, padding: "18px 22px", display: "flex", alignItems: "center", gap: 20 }}>
                <ScoreRing score={result.score} size={88} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 7, color: scoreColor(result.score) }}>
                    {result.score >= 80 ? "✅ Solid Code" : result.score >= 60 ? "⚠️ Needs Work" : "🔴 Critical Issues"}
                  </div>
                  <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6, marginBottom: 10 }}>{result.summary}</div>
                  <div style={{ display: "flex", gap: 18 }}>
                    {[["Critical", criticalCount, "#ff4d4d"], ["Warning", warningCount, "#ffb347"], ["Suggestion", suggestionCount, "#4db8ff"]].map(([l, c, col]) => (
                      <div key={l} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontFamily: "'Syne',sans-serif", fontWeight: 800, color: col }}>{c}</div>
                        <div style={{ fontSize: 9, color: "#444", letterSpacing: "1px", textTransform: "uppercase" }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {result.strengths?.length > 0 && (
                <div style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 8, padding: "12px 16px" }}>
                  <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 9, fontWeight: 600 }}>✓ Strengths</div>
                  {result.strengths.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#6ee7a0", marginBottom: 3, paddingLeft: 8 }}>· {s}</div>)}
                </div>
              )}

              <div>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>
                  Issues · {result.issues?.length || 0} found
                </div>
                {result.issues?.length === 0
                  ? <div style={{ textAlign: "center", color: "#4ade80", fontSize: 13 }}>🎉 No issues found!</div>
                  : result.issues.map(issue => <IssueCard key={issue.id} issue={issue} />)
                }
              </div>
            </div>
          )}

          {/* ── PROJECT RESULT ── */}
          {projectResults && (
            <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Project Score Card */}
              <div style={{ background: "#0e0e1a", border: "1px solid #1e1e2e", borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
                  <ScoreRing score={projectResults.avgScore} size={88} />
                  <div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: scoreColor(projectResults.avgScore), marginBottom: 4 }}>
                      📁 {projectResults.projectName}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
                      {projectResults.totalFiles} files scanned · Average project score
                    </div>
                    <div style={{ display: "flex", gap: 20 }}>
                      {[
                        ["Critical", projectResults.criticals.length, "#ff4d4d"],
                        ["Warning", projectResults.warnings.length, "#ffb347"],
                        ["Suggestion", projectResults.suggestions.length, "#4db8ff"]
                      ].map(([l, c, col]) => (
                        <div key={l} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontFamily: "'Syne',sans-serif", fontWeight: 800, color: col }}>{c}</div>
                          <div style={{ fontSize: 9, color: "#444", letterSpacing: "1px", textTransform: "uppercase" }}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Security Issues — highlighted separately */}
              {projectResults.securityIssues.length > 0 && (
                <div style={{ background: "rgba(255,77,77,0.05)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: "#ff4d4d", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12, fontWeight: 700 }}>
                    🔐 Security Issues — {projectResults.securityIssues.length} found across project
                  </div>
                  {projectResults.securityIssues.map((issue, i) => (
                    <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,77,77,0.1)" }}>
                      <div style={{ fontSize: 11, color: "#ff6b6b", fontWeight: 600, marginBottom: 2 }}>
                        🔴 {issue.title}
                      </div>
                      <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>📄 {issue.fileName} · {issue.line_reference}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>{issue.problem}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Worst Files */}
              {projectResults.worstFiles.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: "#ff4d4d", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>
                    ⚠️ Files Needing Most Attention
                  </div>
                  {projectResults.worstFiles.map((f, i) => (
                    <div key={i} className="file-row">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#d1d5db", fontWeight: 600 }}>{f.fileName}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(f.score) }}>{f.score}/100</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#444", marginBottom: 6 }}>{f.file}</div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${f.score}%`, background: scoreColor(f.score) }} />
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                        {f.issues.filter(i => i.severity === "Critical").length} critical ·
                        {f.issues.filter(i => i.severity === "Warning").length} warnings
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* All Files breakdown */}
              <div>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>
                  All Files · {projectResults.totalFiles} scanned
                </div>
                {projectResults.results.map((f, i) => (
                  <div key={i} className="file-row">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#d1d5db" }}>{f.fileName}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, color: "#444" }}>{f.language}</span>
                        {f.score !== null
                          ? <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(f.score) }}>{f.score}/100</span>
                          : <span style={{ fontSize: 10, color: "#ff4d4d" }}>Error</span>
                        }
                      </div>
                    </div>
                    {f.score !== null && (
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${f.score}%`, background: scoreColor(f.score) }} />
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "#444", marginTop: 6 }}>
                      {f.issues.filter(i => i.severity === "Critical").length > 0 &&
                        <span style={{ color: "#ff4d4d", marginRight: 8 }}>🔴 {f.issues.filter(i => i.severity === "Critical").length} critical</span>
                      }
                      {f.issues.filter(i => i.severity === "Warning").length > 0 &&
                        <span style={{ color: "#ffb347", marginRight: 8 }}>🟡 {f.issues.filter(i => i.severity === "Warning").length} warnings</span>
                      }
                      {f.error && <span style={{ color: "#ff4d4d" }}>⚠️ {f.error}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* All Issues across project */}
              {projectResults.allIssues.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: "#555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>
                    All Issues · {projectResults.allIssues.length} total
                  </div>
                  {projectResults.allIssues.map((issue, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: "#333", marginBottom: 3 }}>📄 {issue.fileName}</div>
                      <IssueCard issue={issue} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>}
    </div>
  );
}