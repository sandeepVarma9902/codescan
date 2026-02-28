/**
 * CareCode — Code Quality + Healthcare Compliance
 * Mobile-first, redesigned UI
 */

import { useState, useRef, useEffect } from "react";
import { reviewCode, STANDARDS, LANGUAGE_LABELS, detectLanguageFromExt } from "@codescan/core";
import { ScoreRing, IssueCard } from "@codescan/ui";
import MipsChat from "./MipsChat.jsx";

const SUPPORTED_EXTENSIONS = [".js",".jsx",".ts",".tsx",".py",".java",".go",".rs",".cpp",".c",".cs",".rb",".php",".swift",".kt",".vue",".svelte",".sql",".sh",".bash",".scala",".r",".dart"];
const IGNORED_DIRS = ["node_modules",".git","dist","build",".next","out","coverage",".turbo"];

const SAMPLE_CODE = `function getUserData(userId) {
  const user = database.find(userId);
  console.log("Fetching user: " + userId);
  const password = "admin123";
  const query = "SELECT * FROM users WHERE id = " + userId;
  return user.name;
}`;

export default function App() {
  const [activeTab, setActiveTab]           = useState("review");
  const [reviewMode, setReviewMode]         = useState("single");
  const [activePanel, setActivePanel]       = useState("input"); // mobile: "input" | "results"
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
      const avgScore = validScores.length ? Math.round(validScores.reduce((s,r) => s+r.score, 0) / validScores.length) : 0;
      setProjectResults({
        projectName, totalFiles: results.length, avgScore, results, allIssues,
        criticals: allIssues.filter(i => i.severity === "Critical"),
        warnings: allIssues.filter(i => i.severity === "Warning"),
        suggestions: allIssues.filter(i => i.severity === "Suggestion"),
        securityIssues: allIssues.filter(i => i.category?.toLowerCase().includes("security") || i.category?.toLowerCase().includes("owasp")),
        worstFiles: [...results].filter(r => r.score!==null).sort((a,b) => a.score-b.score).slice(0,3),
      });
    } catch (e) { setError(e.message); }
    finally { setReviewing(false); setStatus(""); }
  };

  const sc = s => s >= 80 ? "#4ade80" : s >= 60 ? "#fbbf24" : "#f87171";

  return (
    <div style={{ minHeight:"100vh", background:"#07080f", color:"#e2e8f0", fontFamily:"'DM Sans',sans-serif", display:"flex", flexDirection:"column", maxWidth:"100vw", overflowX:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#1e2030;border-radius:4px;}
        
        .cc-btn-primary {
          background: linear-gradient(135deg, #06b6d4, #6366f1);
          border: none; color: white; font-family: 'Bricolage Grotesque', sans-serif;
          font-size: 15px; font-weight: 800; padding: 16px 24px; border-radius: 12px;
          cursor: pointer; width: 100%; letter-spacing: 0.3px;
          transition: all 0.2s; box-shadow: 0 4px 24px rgba(6,182,212,0.2);
          min-height: 52px;
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
        .cc-tab-btn .tab-label { font-size: 10px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .cc-tab-btn.active .tab-label { color: #06b6d4; }
        .cc-tab-btn:not(.active) .tab-label { color: #374151; }

        .cc-chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 8px 14px; border-radius: 24px; cursor: pointer;
          font-size: 13px; font-weight: 500; transition: all 0.15s;
          border: 1.5px solid transparent; user-select: none;
        }
        .cc-chip.on  { background: rgba(6,182,212,0.1); border-color: rgba(6,182,212,0.4); color: #22d3ee; }
        .cc-chip.off { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.07); color: #4b5563; }
        .cc-chip:hover { border-color: rgba(6,182,212,0.4); color: #67e8f9; }

        .cc-input {
          width: 100%; background: #0d0f1a; border: 1.5px solid #1e2030; color: #e2e8f0;
          padding: 12px 16px; border-radius: 10px; font-family: 'DM Mono', monospace;
          font-size: 13px; outline: none; transition: border-color 0.2s;
        }
        .cc-input:focus { border-color: rgba(6,182,212,0.5); }

        .cc-card {
          background: #0d0f1a; border: 1.5px solid #1e2030; border-radius: 14px; padding: 16px;
        }

        .cc-section-label {
          font-size: 11px; color: #374151; letter-spacing: 1.5px; text-transform: uppercase;
          font-weight: 600; margin-bottom: 8px; display: block;
        }

        .cc-engine-btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid;
          font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 12px;
          cursor: pointer; transition: all 0.15s;
        }

        .cc-file-row {
          padding: 12px 14px; border-radius: 10px; border: 1.5px solid #1e2030;
          margin-bottom: 8px; cursor: pointer; transition: all 0.15s;
        }
        .cc-file-row:hover { border-color: rgba(6,182,212,0.3); background: rgba(6,182,212,0.03); }

        .cc-progress { height: 4px; background: #1e2030; border-radius: 2px; overflow: hidden; margin-top: 8px; }
        .cc-progress-fill { height: 100%; border-radius: 2px; transition: width 0.4s; }

        .cc-panel-toggle {
          display: flex; background: #0d0f1a; border: 1.5px solid #1e2030; border-radius: 10px; padding: 4px; gap: 4px;
        }
        .cc-panel-btn {
          flex: 1; padding: 9px; border: none; border-radius: 7px; cursor: pointer;
          font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 13px; transition: all 0.15s;
        }
        .cc-panel-btn.active { background: rgba(6,182,212,0.15); color: #22d3ee; }
        .cc-panel-btn:not(.active) { background: transparent; color: #374151; }

        .drop-zone {
          border: 2px dashed #1e2030; border-radius: 12px; padding: 36px 20px;
          text-align: center; cursor: pointer; transition: all 0.2s;
        }
        .drop-zone:hover { border-color: rgba(6,182,212,0.4); background: rgba(6,182,212,0.02); }

        .spin { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-in { animation: fi 0.35s ease-out; }
        @keyframes fi { from { opacity:0;transform:translateY(8px); } to { opacity:1;transform:none; } }

        .security-badge {
          display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px;
          border-radius: 20px; font-size: 11px; font-weight: 600;
          background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.25); color: #f87171;
        }
        
        /* Gradient text */
        .grad-text {
          background: linear-gradient(135deg, #06b6d4, #818cf8);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }

        textarea.cc-input { resize: vertical; line-height: 1.7; min-height: 240px; }
        select.cc-input { cursor: pointer; }

        @media (min-width: 768px) {
          .mobile-only { display: none !important; }
          .desktop-layout { display: flex !important; }
        }
        @media (max-width: 767px) {
          .desktop-only { display: none !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <header style={{ padding: "14px 20px", borderBottom: "1px solid #1a1c2e", background: "rgba(7,8,15,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: "linear-gradient(135deg,#06b6d4,#6366f1)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: "0 4px 16px rgba(6,182,212,0.3)" }}>⚕</div>
          <div>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1 }}>
              Care<span className="grad-text">Code</span>
            </div>
            <div style={{ fontSize: 9, color: "#374151", letterSpacing: "1.5px", textTransform: "uppercase", marginTop: 1 }}>EHR · MIPS · Code Quality</div>
          </div>
        </div>

        {/* Engine selector — desktop */}
        <div className="desktop-only" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#374151", letterSpacing: "1px", textTransform: "uppercase" }}>Engine</span>
          {["auto","cloud","local"].map(m => (
            <button key={m} className="cc-engine-btn" onClick={() => setEngine(m)} style={{
              borderColor: engine===m ? "rgba(6,182,212,0.5)" : "#1e2030",
              background: engine===m ? "rgba(6,182,212,0.08)" : "transparent",
              color: engine===m ? "#22d3ee" : "#374151",
            }}>
              {m==="auto"?"🔄 Auto":m==="cloud"?"☁️ Cloud":"🖥️ Local"}
            </button>
          ))}
        </div>

        {/* Engine — mobile compact */}
        <div className="mobile-only">
          <select className="cc-input" value={engine} onChange={e => setEngine(e.target.value)} style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}>
            <option value="auto">🔄 Auto</option>
            <option value="cloud">☁️ Cloud</option>
            <option value="local">🖥️ Local</option>
          </select>
        </div>
      </header>

      {/* ── Desktop Tab Bar ── */}
      <div className="desktop-only" style={{ display: "flex", borderBottom: "1px solid #1a1c2e", background: "#07080f", padding: "0 20px" }}>
        {[
          { id: "review", icon: "⚡", label: "Code Review" },
          { id: "mips",   icon: "🏥", label: "MIPS Expert" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "14px 24px", border: "none", background: "transparent",
            cursor: "pointer", fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700,
            fontSize: 14, color: activeTab===tab.id ? "#22d3ee" : "#374151",
            borderBottom: `2px solid ${activeTab===tab.id ? "#06b6d4" : "transparent"}`,
            transition: "all 0.15s", display: "flex", alignItems: "center", gap: 7
          }}>
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {activeTab === "mips" ? (
          <MipsChat />
        ) : (
          <>
            {/* Mobile panel toggle */}
            {isMobile && (
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1c2e" }}>
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

            <div className="desktop-layout" style={{ flex:1, display:"flex", flexDirection:"column" }}>
              <div style={{ display: isMobile ? "block" : "flex", flex: 1 }}>

                {/* ── Left / Input Panel ── */}
                {(!isMobile || activePanel==="input") && (
                  <div style={{ width: isMobile?"100%":"52%", padding: isMobile?"16px":"24px", borderRight: isMobile?"none":"1px solid #1a1c2e", display:"flex", flexDirection:"column", gap:16 }}>

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
                      <button onClick={() => setShowStandards(!showStandards)} style={{ width:"100%", background:"#0d0f1a", border:"1.5px solid #1e2030", borderRadius:10, padding:"11px 14px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", color:"#e2e8f0" }}>
                        <span style={{ fontSize:14 }}>{STANDARDS.filter(s => selectedStandards.includes(s.id)).map(s => s.icon).join("  ") || "Select standards..."}</span>
                        <span style={{ color:"#374151", fontSize:12 }}>{showStandards?"▲":"▼"}</span>
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
                          <span className="cc-section-label">Code · {code.split('\n').length} lines</span>
                          <textarea className="cc-input" value={code} onChange={e => setCode(e.target.value)} spellCheck={false} placeholder={`Paste your ${language} code here...`} style={{ minHeight: isMobile?200:280 }} />
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
                            <div style={{ fontSize:12, color:"#374151" }}>
                              {projectFiles.length ? `${projectFiles.length} code files ready` : "JS, TS, Python, Java, Go + 30 more"}
                            </div>
                            <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple onChange={handleFolderUpload} style={{ display:"none" }} />
                          </div>
                        </div>
                        {projectFiles.length > 0 && (
                          <div style={{ maxHeight:160, overflowY:"auto" }}>
                            {projectFiles.slice(0,20).map((f,i) => (
                              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"rgba(255,255,255,0.02)", border:"1px solid #1e2030", borderRadius:8, marginBottom:4, fontSize:11, color:"#4b5563" }}>
                                <span>{detectLanguageFromExt(f.name)?.icon||"📄"}</span>
                                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.webkitRelativePath}</span>
                                <span style={{ color:"#1f2937", flexShrink:0 }}>{(f.size/1024).toFixed(1)}KB</span>
                              </div>
                            ))}
                            {projectFiles.length > 20 && <div style={{ fontSize:11, color:"#374151", textAlign:"center", padding:6 }}>+{projectFiles.length-20} more files</div>}
                          </div>
                        )}
                      </>
                    )}

                    {/* Custom rules */}
                    <div>
                      <button onClick={() => setShowCustom(!showCustom)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#374151", padding:0, display:"flex", alignItems:"center", gap:6 }}>
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
                      disabled={reviewing || (reviewMode==="single"?!code.trim():!projectFiles.length) || !selectedStandards.length}>
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
                        <div style={{ fontSize:13, color:"#374151", textAlign:"center", maxWidth:260, lineHeight:1.7 }}>
                          {reviewMode==="project" ? "Upload your project folder to get a full report" : "Paste code, pick standards, hit Analyze"}
                        </div>
                      </div>
                    )}

                    {/* Loading */}
                    {reviewing && (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:"60px 20px" }}>
                        <div style={{ width:60, height:60, border:"3px solid #1e2030", borderTopColor:"#06b6d4", borderRadius:"50%" }} className="spin" />
                        <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:16, fontWeight:700 }}>
                          {reviewMode==="project" ? "Scanning Project..." : "Analyzing Code..."}
                        </div>
                        <div style={{ fontSize:12, color:"#374151", textAlign:"center" }}>{status}</div>
                      </div>
                    )}

                    {/* Error */}
                    {error && (
                      <div style={{ background:"rgba(248,113,113,0.08)", border:"1.5px solid rgba(248,113,113,0.2)", borderRadius:12, padding:16, color:"#f87171", fontSize:13 }}>
                        ⚠️ {error}
                      </div>
                    )}

                    {/* Single file result */}
                    {result && !projectResults && (
                      <div className="fade-in" style={{ display:"flex", flexDirection:"column", gap:16 }}>

                        {/* Score card */}
                        <div className="cc-card" style={{ display:"flex", alignItems:"center", gap:18 }}>
                          <ScoreRing score={result.score} size={isMobile?72:88} />
                          <div style={{ flex:1 }}>
                            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:15, fontWeight:800, color:sc(result.score), marginBottom:6 }}>
                              {result.score>=80?"✅ Solid Code":result.score>=60?"⚠️ Needs Work":"🔴 Critical Issues"}
                            </div>
                            <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.6, marginBottom:10 }}>{result.summary}</div>
                            <div style={{ display:"flex", gap:16 }}>
                              {[["Critical",result.issues?.filter(i=>i.severity==="Critical").length||0,"#f87171"],
                                ["Warning",result.issues?.filter(i=>i.severity==="Warning").length||0,"#fbbf24"],
                                ["Suggest",result.issues?.filter(i=>i.severity==="Suggestion").length||0,"#22d3ee"]].map(([l,c,col]) => (
                                <div key={l} style={{ textAlign:"center" }}>
                                  <div style={{ fontSize:22, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:800, color:col }}>{c}</div>
                                  <div style={{ fontSize:9, color:"#374151", textTransform:"uppercase", letterSpacing:"1px" }}>{l}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Strengths */}
                        {result.strengths?.length > 0 && (
                          <div style={{ background:"rgba(74,222,128,0.05)", border:"1.5px solid rgba(74,222,128,0.15)", borderRadius:12, padding:"12px 16px" }}>
                            <span className="cc-section-label" style={{ color:"#4ade80" }}>✓ Strengths</span>
                            {result.strengths.map((s,i) => <div key={i} style={{ fontSize:13, color:"#6ee7a0", marginBottom:4, paddingLeft:8 }}>· {s}</div>)}
                          </div>
                        )}

                        {/* Issues */}
                        <div>
                          <span className="cc-section-label">Issues · {result.issues?.length||0} found</span>
                          {result.issues?.length===0
                            ? <div style={{ textAlign:"center", color:"#4ade80", fontSize:14, padding:"20px 0" }}>🎉 No issues found!</div>
                            : result.issues.map(issue => <IssueCard key={issue.id} issue={issue} />)
                          }
                        </div>
                      </div>
                    )}

                    {/* Project result */}
                    {projectResults && (
                      <div className="fade-in" style={{ display:"flex", flexDirection:"column", gap:16 }}>

                        <div className="cc-card" style={{ display:"flex", alignItems:"center", gap:18 }}>
                          <ScoreRing score={projectResults.avgScore} size={isMobile?72:88} />
                          <div>
                            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:15, fontWeight:800, color:sc(projectResults.avgScore), marginBottom:4 }}>
                              📁 {projectResults.projectName}
                            </div>
                            <div style={{ fontSize:12, color:"#6b7280", marginBottom:10 }}>{projectResults.totalFiles} files · project average</div>
                            <div style={{ display:"flex", gap:16 }}>
                              {[["Critical",projectResults.criticals.length,"#f87171"],
                                ["Warning",projectResults.warnings.length,"#fbbf24"],
                                ["Suggest",projectResults.suggestions.length,"#22d3ee"]].map(([l,c,col]) => (
                                <div key={l} style={{ textAlign:"center" }}>
                                  <div style={{ fontSize:22, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:800, color:col }}>{c}</div>
                                  <div style={{ fontSize:9, color:"#374151", textTransform:"uppercase", letterSpacing:"1px" }}>{l}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {projectResults.securityIssues.length > 0 && (
                          <div style={{ background:"rgba(248,113,113,0.05)", border:"1.5px solid rgba(248,113,113,0.18)", borderRadius:12, padding:"14px 16px" }}>
                            <span className="cc-section-label" style={{ color:"#f87171" }}>🔐 Security Issues · {projectResults.securityIssues.length} across project</span>
                            {projectResults.securityIssues.map((issue,i) => (
                              <div key={i} style={{ marginBottom:10, paddingBottom:10, borderBottom:"1px solid rgba(248,113,113,0.1)" }}>
                                <div style={{ fontSize:12, color:"#f87171", fontWeight:600, marginBottom:2 }}>🔴 {issue.title}</div>
                                <div style={{ fontSize:11, color:"#4b5563", marginBottom:3 }}>📄 {issue.fileName} · {issue.line_reference}</div>
                                <div style={{ fontSize:12, color:"#6b7280" }}>{issue.problem}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {projectResults.worstFiles.length > 0 && (
                          <div>
                            <span className="cc-section-label" style={{ color:"#fbbf24" }}>⚠️ Files Needing Attention</span>
                            {projectResults.worstFiles.map((f,i) => (
                              <div key={i} className="cc-file-row">
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                                  <span style={{ fontSize:13, fontWeight:600 }}>{f.fileName}</span>
                                  <span style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:14, fontWeight:800, color:sc(f.score) }}>{f.score}/100</span>
                                </div>
                                <div className="cc-progress"><div className="cc-progress-fill" style={{ width:`${f.score}%`, background:sc(f.score) }} /></div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div>
                          <span className="cc-section-label">All Files · {projectResults.totalFiles}</span>
                          {projectResults.results.map((f,i) => (
                            <div key={i} className="cc-file-row">
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                                <span style={{ fontSize:12, color:"#d1d5db" }}>{f.fileName}</span>
                                {f.score!==null
                                  ? <span style={{ fontSize:13, fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:800, color:sc(f.score) }}>{f.score}/100</span>
                                  : <span style={{ fontSize:11, color:"#f87171" }}>Error</span>
                                }
                              </div>
                              {f.score!==null && <div className="cc-progress"><div className="cc-progress-fill" style={{ width:`${f.score}%`, background:sc(f.score) }} /></div>}
                              <div style={{ fontSize:11, color:"#374151", marginTop:6, display:"flex", gap:10 }}>
                                {f.issues.filter(i=>i.severity==="Critical").length>0 && <span style={{ color:"#f87171" }}>🔴 {f.issues.filter(i=>i.severity==="Critical").length} critical</span>}
                                {f.issues.filter(i=>i.severity==="Warning").length>0 && <span style={{ color:"#fbbf24" }}>🟡 {f.issues.filter(i=>i.severity==="Warning").length} warnings</span>}
                                {f.error && <span style={{ color:"#f87171" }}>⚠️ {f.error}</span>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {projectResults.allIssues.length > 0 && (
                          <div>
                            <span className="cc-section-label">All Issues · {projectResults.allIssues.length}</span>
                            {projectResults.allIssues.map((issue,i) => (
                              <div key={i} style={{ marginBottom:8 }}>
                                <div style={{ fontSize:10, color:"#374151", marginBottom:3 }}>📄 {issue.fileName}</div>
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
      <nav className="mobile-only" style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(7,8,15,0.97)", backdropFilter:"blur(16px)", borderTop:"1px solid #1a1c2e", display:"flex", zIndex:100, paddingBottom:"env(safe-area-inset-bottom)" }}>
        {[
          { id:"review", icon:"⚡", label:"Code Review" },
          { id:"mips",   icon:"🏥", label:"MIPS Expert" },
        ].map(tab => (
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