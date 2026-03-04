/**
 * CareCode — Code Quality + Healthcare Compliance
 * Mobile-first, redesigned UI
 */

import { useState, useRef, useEffect } from "react";
import { reviewCode, STANDARDS, LANGUAGE_LABELS, detectLanguageFromExt } from "@codescan/core";
import { ScoreRing, IssueCard } from "@codescan/ui";
import MipsChat  from "./MipsChat.jsx";
import DevTools  from "./DevTools.jsx";

const SUPPORTED_EXTENSIONS = [".js",".jsx",".ts",".tsx",".py",".java",".go",".rs",".cpp",".c",".cs",".rb",".php",".swift",".kt",".vue",".svelte",".sql",".sh",".bash",".scala",".r",".dart"];
const IGNORED_DIRS = ["node_modules",".git","dist","build",".next","out","coverage",".turbo"];

const SAMPLE_CODE = `function getUserData(userId) {
  const user = database.find(userId);
  console.log("Fetching user: " + userId);
  const password = "admin123";
  const query = "SELECT * FROM users WHERE id = " + userId;
  return user.name;
}`;

const TABS = [
  { id: "review",   icon: "⚡",  label: "Code Review" },
  { id: "mips",     icon: "🏥", label: "MIPS Expert"  },
  { id: "devtools", icon: "🛠️", label: "Dev Tools"    },
];

export default function App() {
  const [activeTab, setActiveTab]           = useState("review");
  const [isDark, setIsDark]                 = useState(true);
  const [reviewMode, setReviewMode]         = useState("single");
  const [activePanel, setActivePanel]       = useState("input");
  const [code, setCode]                     = useState(SAMPLE_CODE);
  const [language, setLanguage]             = useState("JavaScript");
  const [projectFiles, setProjectFiles]     = useState([]);
  const [projectName, setProjectName]       = useState("");
  const [selectedStandards, setSelectedStandards] = useState(["solid","null_safety","owasp","error_handling"]);
  const [engine, setEngine]                 = useState("auto");
  const [customRules, setCustomRules]       = useState("");
  const [showStandards, setShowStandards]   = useState(false);
  const [showCustom, setShowCustom]         = useState(false);
  const [reviewing, setReviewing]           = useState(false);
  const [status, setStatus]                 = useState("");
  const [result, setResult]                 = useState(null);
  const [projectResults, setProjectResults] = useState(null);
  const [error, setError]                   = useState(null);
  const [isMobile, setIsMobile]             = useState(window.innerWidth < 768);
  const folderInputRef                      = useRef(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Theme colours (passed to child components + used in Code Review panel)
  const bg      = isDark ? "#07080f" : "#f1f5f9";
  const surface = isDark ? "#0d0f1a" : "#ffffff";
  const border  = isDark ? "#1a1c2e" : "#e2e8f0";
  const text    = isDark ? "#e2e8f0" : "#0f172a";
  const textSub = isDark ? "#9ca3af" : "#64748b";
  const muted   = isDark ? "#374151" : "#94a3b8";
  const inputBg = isDark ? "#0d0f1a" : "#f8fafc";

  const toggleStandard = id =>
    setSelectedStandards(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id]);

  const handleFolderUpload = e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const projName = files[0].webkitRelativePath.split("/")[0];
    setProjectName(projName);
    const codeFiles = files.filter(f => {
      const parts = f.webkitRelativePath.split("/");
      const ignored = parts.some(p => IGNORED_DIRS.includes(p));
      const ext = "." + f.name.split(".").pop().toLowerCase();
      return !ignored && SUPPORTED_EXTENSIONS.includes(ext) && f.size < 100000;
    });
    setProjectFiles(codeFiles);
    setResult(null); setProjectResults(null); setError(null);
  };

  const runSingleReview = async () => {
    setReviewing(true); setResult(null); setError(null); setStatus("");
    if (isMobile) setActivePanel("results");
    try {
      const review = await reviewCode(
        { code, language, standards: selectedStandards, customRules },
        { mode: engine, onStatus: setStatus }
      );
      setResult(review);
    } catch (e) {
      setError(e.message.includes("fetch") ? "Server waking up — try again in 30s." : e.message);
    } finally { setReviewing(false); setStatus(""); }
  };

  const runProjectReview = async () => {
    if (!projectFiles.length) return;
    setReviewing(true); setProjectResults(null); setError(null);
    if (isMobile) setActivePanel("results");
    const results = []; const allIssues = [];
    try {
      for (let i = 0; i < projectFiles.length; i++) {
        const file = projectFiles[i];
        const lang = detectLanguageFromExt(file.name)?.label || "JavaScript";
        setStatus(`Reviewing ${i+1}/${projectFiles.length}: ${file.name}...`);
        try {
          const fileCode = await file.text();
          const review = await reviewCode(
            { code: fileCode, language: lang, standards: selectedStandards, customRules },
            { mode: engine, onStatus: () => {} }
          );
          results.push({ file: file.webkitRelativePath, fileName: file.name, language: lang, score: review.score, summary: review.summary, issues: review.issues || [], strengths: review.strengths || [] });
          (review.issues || []).forEach(issue => allIssues.push({ ...issue, file: file.webkitRelativePath, fileName: file.name }));
        } catch (fe) {
          results.push({ file: file.webkitRelativePath, fileName: file.name, language: lang, score: null, error: fe.message, issues: [] });
        }
      }
      const validScores = results.filter(r => r.score !== null);
      const avgScore = validScores.length
        ? Math.round(validScores.reduce((s, r) => s + r.score, 0) / validScores.length) : 0;
      setProjectResults({
        projectName, totalFiles: results.length, avgScore, results, allIssues,
        criticals:      allIssues.filter(i => i.severity === "Critical"),
        warnings:       allIssues.filter(i => i.severity === "Warning"),
        suggestions:    allIssues.filter(i => i.severity === "Suggestion"),
        securityIssues: allIssues.filter(i => i.category?.toLowerCase().includes("security") || i.category?.toLowerCase().includes("owasp")),
        worstFiles:     [...results].filter(r => r.score !== null).sort((a, b) => a.score - b.score).slice(0, 3),
      });
    } catch (e) { setError(e.message); }
    finally { setReviewing(false); setStatus(""); }
  };

  const sc = s => s >= 80 ? "#4ade80" : s >= 60 ? "#fbbf24" : "#f87171";

  return (
    <div style={{ minHeight:"100vh", background: bg, color: text, fontFamily:"'DM Sans',sans-serif", display:"flex", flexDirection:"column", maxWidth:"100vw", overflowX:"hidden", transition:"background 0.2s, color 0.2s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:${border};border-radius:4px;}

        .cc-btn-primary {
          background: linear-gradient(135deg, #06b6d4, #6366f1);
          border: none; color: white; font-family: 'Bricolage Grotesque', sans-serif;
          font-size: 15px; font-weight: 800; padding: 16px 24px; border-radius: 12px;
          cursor: pointer; width: 100%; letter-spacing: 0.3px;
          transition: all 0.2s; box-shadow: 0 4px 24px rgba(6,182,212,0.2); min-height: 52px;
        }
        .cc-btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(6,182,212,0.35);}
        .cc-btn-primary:active{transform:translateY(0);}
        .cc-btn-primary:disabled{opacity:0.35;cursor:not-allowed;transform:none;box-shadow:none;}

        .cc-tab-btn {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 4px; padding: 8px 16px; border: none; background: transparent;
          cursor: pointer; transition: all 0.2s; flex: 1; min-height: 56px;
          border-top: 2px solid transparent;
        }
        .cc-tab-btn.active { border-top-color: #06b6d4; }
        .cc-tab-btn .tab-icon { font-size: 20px; }
        .cc-tab-btn .tab-label { font-size: 10px; font-weight: 600; letter-spacing: 0.5px; color: ${muted}; }
        .cc-tab-btn.active .tab-label { color: #22d3ee; }

        .cc-input {
          width: 100%; background: ${inputBg}; border: 1.5px solid ${border};
          color: ${text}; padding: 12px 14px; border-radius: 10px;
          font-family: 'DM Mono', monospace; font-size: 13px; outline: none;
          resize: vertical; transition: border-color 0.2s; line-height: 1.6;
        }
        .cc-input:focus { border-color: #06b6d4; }

        .cc-card {
          background: ${surface}; border: 1px solid ${border};
          border-radius: 12px; padding: 14px;
        }
        .cc-section-label {
          display: block; font-size: 10px; color: ${muted}; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px;
        }
        .cc-chip {
          display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px;
          border-radius: 20px; cursor: pointer; font-size: 11px;
          transition: all 0.12s; user-select: none; border: 1px solid;
        }
        .cc-chip.on  { border-color:rgba(6,182,212,0.4);  background:rgba(6,182,212,0.1);  color:#22d3ee; }
        .cc-chip.off { border-color:${border}; background:transparent; color:${muted}; }
        .cc-chip.off:hover { border-color:rgba(6,182,212,0.25); color:${textSub}; }

        .cc-panel-toggle {
          display: flex; background: ${inputBg}; border: 1px solid ${border};
          border-radius: 10px; padding: 3px; gap: 3px;
        }
        .cc-panel-btn {
          flex: 1; padding: 8px 12px; border-radius: 8px; border: none;
          cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px;
          font-weight: 600; transition: all 0.15s; background: transparent; color: ${muted};
        }
        .cc-panel-btn.active { background: ${surface}; color: #22d3ee; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }

        .cc-progress { height: 4px; background: ${border}; border-radius: 2px; margin-top: 6px; overflow: hidden; }
        .cc-progress-fill { height: 100%; border-radius: 2px; transition: width 0.4s; }

        .drop-zone {
          border: 2px dashed ${border}; border-radius: 12px;
          padding: 28px 20px; text-align: center; cursor: pointer;
          transition: all 0.2s; background: ${inputBg};
        }
        .drop-zone:hover { border-color: #06b6d4; background: rgba(6,182,212,0.04); }

        .fade-in { animation: fadeIn 0.25s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        .spin { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .desktop-only { display: flex; }
        .mobile-only  { display: none;  }
        @media (max-width: 767px) {
          .desktop-only { display: none !important; }
          .mobile-only  { display: flex !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <header style={{ padding:"12px 20px", borderBottom:"1px solid " + border, background: surface, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexShrink:0 }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:"linear-gradient(135deg,#06b6d4,#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚡</div>
          <div>
            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:15, fontWeight:800, color:text, lineHeight:1.1 }}>CareCode</div>
            <div style={{ fontSize:9, color:muted, letterSpacing:"1.5px", textTransform:"uppercase" }}>EHR · MIPS · CODE QUALITY</div>
          </div>
        </div>

        {/* Engine selector — desktop */}
        <div className="desktop-only" style={{ alignItems:"center", gap:6 }}>
          <span style={{ fontSize:11, color:muted, marginRight:4, textTransform:"uppercase", letterSpacing:"1px" }}>ENGINE</span>
          {["auto","cloud","local"].map(m => (
            <button key={m} onClick={() => setEngine(m)} style={{
              padding:"6px 14px", borderRadius:8, border:"1.5px solid",
              borderColor: engine===m ? "rgba(6,182,212,0.5)" : border,
              background:  engine===m ? "rgba(6,182,212,0.08)" : "transparent",
              color:       engine===m ? "#22d3ee" : muted,
              fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s"
            }}>
              {m==="auto"?"🔄 Auto":m==="cloud"?"☁️ Cloud":"🖥️ Local"}
            </button>
          ))}
        </div>

        {/* Engine selector — mobile compact */}
        <div className="mobile-only" style={{ alignItems:"center", gap:8 }}>
          <select className="cc-input" value={engine} onChange={e => setEngine(e.target.value)} style={{ width:"auto", padding:"6px 10px", fontSize:12 }}>
            <option value="auto">🔄 Auto</option>
            <option value="cloud">☁️ Cloud</option>
            <option value="local">🖥️ Local</option>
          </select>
        </div>

        {/* Dark mode toggle */}
        <button onClick={() => setIsDark(d => !d)} style={{
          width:34, height:34, borderRadius:8, border:"1.5px solid " + border,
          background:"transparent", cursor:"pointer", fontSize:16,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
          transition:"border-color 0.2s"
        }}>
          {isDark ? "☀️" : "🌙"}
        </button>
      </header>

      {/* ── Desktop Tab Bar ── */}
      <div className="desktop-only" style={{ borderBottom:"1px solid " + border, background: surface, padding:"0 20px" }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding:"14px 24px", border:"none", background:"transparent",
            cursor:"pointer", fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:700,
            fontSize:14, color: activeTab===tab.id ? "#22d3ee" : muted,
            borderBottom:`2px solid ${activeTab===tab.id ? "#06b6d4" : "transparent"}`,
            transition:"all 0.15s", display:"flex", alignItems:"center", gap:7
          }}>
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Content ── */}
      <main style={{ flex:1, display:"flex", flexDirection:"column" }}>

        {activeTab === "mips" ? (
          <MipsChat isDark={isDark} />

        ) : activeTab === "devtools" ? (
          <DevTools isDark={isDark} />

        ) : (
          <>
            {/* Mobile panel toggle */}
            {isMobile && (
              <div style={{ padding:"12px 16px", borderBottom:"1px solid " + border }}>
                <div className="cc-panel-toggle">
                  <button className={`cc-panel-btn ${activePanel==="input"?"active":""}`} onClick={() => setActivePanel("input")}>
                    ✏️ Input
                  </button>
                  <button className={`cc-panel-btn ${activePanel==="results"?"active":""}`} onClick={() => setActivePanel("results")}>
                    📊 Results {result && `· ${result.issues?.length||0} issues`}
                  </button>
                </div>
              </div>
            )}

            <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
              <div style={{ display: isMobile ? "block" : "flex", flex:1 }}>

                {/* ── Left / Input Panel ── */}
                {(!isMobile || activePanel==="input") && (
                  <div style={{ width:isMobile?"100%":"52%", padding:isMobile?"16px":"24px", borderRight:isMobile?"none":"1px solid "+border, display:"flex", flexDirection:"column", gap:16 }}>

                    {/* Mode toggle */}
                    <div className="cc-panel-toggle">
                      <button className={`cc-panel-btn ${reviewMode==="single"?"active":""}`} onClick={() => { setReviewMode("single"); setProjectResults(null); }}>
                        📄 Single File
                      </button>
                      <button className={`cc-panel-btn ${reviewMode==="project"?"active":""}`} onClick={() => { setReviewMode("project"); setResult(null); }}>
                        📁 Project Folder
                      </button>
                    </div>

                    {/* Standards */}
                    <div>
                      <span className="cc-section-label">Standards ({selectedStandards.length} active)</span>
                      <button onClick={() => setShowStandards(!showStandards)} style={{ width:"100%", background:inputBg, border:"1.5px solid "+border, borderRadius:10, padding:"11px 14px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", color:text }}>
                        <span style={{ fontSize:14 }}>{STANDARDS.filter(s => selectedStandards.includes(s.id)).map(s => s.icon).join("  ") || "Select standards..."}</span>
                        <span style={{ color:muted, fontSize:12 }}>{showStandards?"▲":"▼"}</span>
                      </button>
                      {showStandards && (
                        <div className="cc-card fade-in" style={{ marginTop:8 }}>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                            {STANDARDS.map(s => (
                              <span key={s.id} className={`cc-chip ${selectedStandards.includes(s.id)?"on":"off"}`} onClick={() => toggleStandard(s.id)}>
                                {s.icon} {s.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Single file mode */}
                    {reviewMode === "single" && (
                      <>
                        <div>
                          <span className="cc-section-label">Language</span>
                          <select className="cc-input" value={language} onChange={e => setLanguage(e.target.value)} style={{ maxWidth:200 }}>
                            {LANGUAGE_LABELS.map(l => <option key={l}>{l}</option>)}
                          </select>
                        </div>
                        <div style={{ flex:1 }}>
                          <span className="cc-section-label">Code · {code.split("\n").length} lines</span>
                          <textarea className="cc-input" value={code} onChange={e => setCode(e.target.value)} spellCheck={false} placeholder={`Paste your ${language} code here...`} style={{ minHeight:isMobile?200:280 }} />
                        </div>
                      </>
                    )}

                    {/* Project folder mode */}
                    {reviewMode === "project" && (
                      <>
                        <div>
                          <span className="cc-section-label">Project Folder</span>
                          <div className="drop-zone" onClick={() => folderInputRef.current?.click()}>
                            <div style={{ fontSize:36, marginBottom:10 }}>📁</div>
                            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:16, fontWeight:700, color:"#22d3ee", marginBottom:6 }}>
                              {projectFiles.length ? projectName : "Tap to select project folder"}
                            </div>
                            <div style={{ fontSize:12, color:muted }}>
                              {projectFiles.length ? `${projectFiles.length} code files ready` : "JS, TS, Python, Java, Go + 30 more"}
                            </div>
                            <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple onChange={handleFolderUpload} style={{ display:"none" }} />
                          </div>
                        </div>
                        {projectFiles.length > 0 && (
                          <div style={{ maxHeight:160, overflowY:"auto" }}>
                            {projectFiles.slice(0,20).map((f,i) => (
                              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background: isDark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.03)", border:"1px solid "+border, borderRadius:8, marginBottom:4, fontSize:11, color:muted }}>
                                <span>{detectLanguageFromExt(f.name)?.icon||"📄"}</span>
                                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.webkitRelativePath}</span>
                                <span style={{ color:muted, flexShrink:0 }}>{(f.size/1024).toFixed(1)}KB</span>
                              </div>
                            ))}
                            {projectFiles.length > 20 && <div style={{ fontSize:11, color:muted, textAlign:"center", padding:6 }}>+{projectFiles.length-20} more files</div>}
                          </div>
                        )}
                      </>
                    )}

                    {/* Custom rules */}
                    <div>
                      <button onClick={() => setShowCustom(!showCustom)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:muted, padding:0, display:"flex", alignItems:"center", gap:6 }}>
                        <span>{showCustom?"▼":"▶"}</span> Custom rules (optional)
                      </button>
                      {showCustom && (
                        <textarea className="cc-input" value={customRules} onChange={e => setCustomRules(e.target.value)} rows={2} style={{ marginTop:8, minHeight:"auto", resize:"vertical" }} placeholder="e.g. No console.log in production. All functions must have JSDoc..." />
                      )}
                    </div>

                    {status && (
                      <div style={{ fontSize:12, color:"#22d3ee", display:"flex", alignItems:"center", gap:8 }}>
                        <span className="spin">⚡</span> {status}
                      </div>
                    )}

                    <button className="cc-btn-primary"
                      onClick={reviewMode==="single" ? runSingleReview : runProjectReview}
                      disabled={reviewing || (reviewMode==="single" ? !code.trim() : !projectFiles.length) || !selectedStandards.length}>
                      {reviewing
                        ? reviewMode==="project" ? `⚡ Scanning ${projectFiles.length} files...` : "⚡ Analyzing..."
                        : reviewMode==="project" ? `⚡ Scan Project (${projectFiles.length} files)` : "⚡ Analyze Code"
                      }
                    </button>
                  </div>
                )}

                {/* ── Right / Results Panel ── */}
                {(!isMobile || activePanel==="results") && (
                  <div style={{ width:isMobile?"100%":"48%", padding:isMobile?"16px":"24px", overflowY:"auto", maxHeight:isMobile?"none":"calc(100vh - 120px)" }}>

                    {/* Empty state */}
                    {!result && !projectResults && !reviewing && !error && (
                      <div style={{ height:"100%", minHeight:300, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, opacity:0.3 }}>
                        <div style={{ fontSize:48 }}>{reviewMode==="project"?"📁":"🔍"}</div>
                        <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:20, fontWeight:800 }}>
                          {reviewMode==="project" ? "Select a Project" : "Awaiting Review"}
                        </div>
                        <div style={{ fontSize:13, color:muted, textAlign:"center", maxWidth:260, lineHeight:1.7 }}>
                          {reviewMode==="project" ? "Upload your project folder to get a full report" : "Paste code, pick standards, hit Analyze"}
                        </div>
                      </div>
                    )}

                    {/* Loading */}
                    {reviewing && (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:"60px 20px" }}>
                        <div style={{ width:60, height:60, border:"3px solid "+border, borderTopColor:"#06b6d4", borderRadius:"50%" }} className="spin" />
                        <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:16, fontWeight:700, color:text }}>
                          {reviewMode==="project" ? `Scanning files...` : "Analyzing code..."}
                        </div>
                        {status && <div style={{ fontSize:12, color:muted }}>{status}</div>}
                      </div>
                    )}

                    {/* Error */}
                    {error && !reviewing && (
                      <div style={{ background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.25)", borderRadius:12, padding:"14px 18px", color:"#f87171", fontSize:13 }}>
                        ⚠️ {error}
                      </div>
                    )}

                    {/* ── Single file result ── */}
                    {result && !reviewing && (
                      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                        {/* Score header */}
                        <div className="cc-card" style={{ display:"flex", alignItems:"center", gap:16 }}>
                          <ScoreRing score={result.score} size={72} />
                          <div style={{ flex:1 }}>
                            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:18, fontWeight:800, color:sc(result.score) }}>
                              {result.score >= 80 ? "✅ Solid Code" : result.score >= 60 ? "⚠️ Needs Work" : "🔴 Critical Issues"}
                            </div>
                            <div style={{ fontSize:11, color:muted, marginTop:3 }}>
                              {result.language} · {result.engine} · {(result.issues||[]).length} issues
                            </div>
                            <div style={{ fontSize:12, color:textSub, marginTop:6, lineHeight:1.6 }}>{result.summary}</div>
                          </div>
                        </div>

                        {/* Strengths */}
                        {result.strengths?.length > 0 && (
                          <div style={{ background:"rgba(74,222,128,0.05)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:12, padding:"12px 14px" }}>
                            <span className="cc-section-label" style={{ color:"#4ade80" }}>✓ Strengths</span>
                            {result.strengths.map((s,i) => (
                              <div key={i} style={{ fontSize:12, color:textSub, lineHeight:1.6 }}>· {s}</div>
                            ))}
                          </div>
                        )}

                        {/* Issues */}
                        {result.issues?.length > 0 && (
                          <div>
                            <span className="cc-section-label">Issues · {result.issues.length} found</span>
                            {result.issues.map((issue,i) => <IssueCard key={i} issue={issue} />)}
                          </div>
                        )}
                        {result.issues?.length === 0 && (
                          <div style={{ textAlign:"center", padding:"24px 0", color:"#4ade80", fontSize:14 }}>🎉 No issues found!</div>
                        )}
                      </div>
                    )}

                    {/* ── Project result ── */}
                    {projectResults && !reviewing && (
                      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                        {/* Project summary */}
                        <div className="cc-card">
                          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:14 }}>
                            <ScoreRing score={projectResults.avgScore} size={64} />
                            <div>
                              <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:16, fontWeight:800, color:text }}>{projectResults.projectName}</div>
                              <div style={{ fontSize:11, color:muted, marginTop:3 }}>{projectResults.totalFiles} files · avg score {projectResults.avgScore}/100</div>
                            </div>
                          </div>
                          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                            {[
                              { label:"Critical", count:projectResults.criticals.length,   color:"#f87171" },
                              { label:"Warnings", count:projectResults.warnings.length,    color:"#fbbf24" },
                              { label:"Security", count:projectResults.securityIssues.length, color:"#fb923c" },
                              { label:"Suggestions", count:projectResults.suggestions.length, color:"#60a5fa" },
                            ].map(({ label, count, color }) => (
                              <div key={label} style={{ background: isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.04)", borderRadius:8, padding:"8px 14px", textAlign:"center" }}>
                                <div style={{ fontSize:20, fontWeight:800, color, fontFamily:"'Bricolage Grotesque',sans-serif" }}>{count}</div>
                                <div style={{ fontSize:10, color:muted, marginTop:2 }}>{label}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Worst files */}
                        {projectResults.worstFiles.length > 0 && (
                          <div>
                            <span className="cc-section-label">Needs Attention</span>
                            {projectResults.worstFiles.map((f,i) => (
                              <div key={i} className="cc-card" style={{ marginBottom:8 }}>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                                  <div style={{ fontSize:12, color:text, fontWeight:600 }}>{f.fileName}</div>
                                  <span style={{ fontSize:13, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:800, color:sc(f.score) }}>{f.score}/100</span>
                                </div>
                                <div className="cc-progress"><div className="cc-progress-fill" style={{ width:`${f.score}%`, background:sc(f.score) }} /></div>
                                <div style={{ fontSize:11, color:muted, marginTop:6, display:"flex", gap:10 }}>
                                  {f.issues.filter(i=>i.severity==="Critical").length>0 && <span style={{ color:"#f87171" }}>🔴 {f.issues.filter(i=>i.severity==="Critical").length} critical</span>}
                                  {f.issues.filter(i=>i.severity==="Warning").length>0  && <span style={{ color:"#fbbf24" }}>🟡 {f.issues.filter(i=>i.severity==="Warning").length} warnings</span>}
                                  {f.error && <span style={{ color:"#f87171" }}>⚠️ {f.error}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* All issues */}
                        {projectResults.allIssues.length > 0 && (
                          <div>
                            <span className="cc-section-label">All Issues · {projectResults.allIssues.length}</span>
                            {projectResults.allIssues.map((issue,i) => (
                              <div key={i} style={{ marginBottom:8 }}>
                                <div style={{ fontSize:10, color:muted, marginBottom:3 }}>📄 {issue.fileName}</div>
                                <IssueCard issue={issue} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="mobile-only" style={{ position:"fixed", bottom:0, left:0, right:0, background: isDark?"rgba(7,8,15,0.97)":"rgba(255,255,255,0.97)", backdropFilter:"blur(16px)", borderTop:"1px solid "+border, display:"flex", zIndex:100, paddingBottom:"env(safe-area-inset-bottom)" }}>
        {TABS.map(tab => (
          <button key={tab.id} className={`cc-tab-btn ${activeTab===tab.id?"active":""}`} onClick={() => setActiveTab(tab.id)}>
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom nav spacer on mobile */}
      <div className="mobile-only" style={{ height:72 }} />
    </div>
  );
}