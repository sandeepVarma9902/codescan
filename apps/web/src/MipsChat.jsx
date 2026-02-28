/**
 * MipsChat.jsx — Full-screen chat, mobile-first
 * Measure selector collapses into a top bar after loading
 */

import { useState, useRef, useEffect } from "react";

const SERVER = "https://codescan-server.onrender.com";
const YEARS  = ["2026", "2025", "2024", "2023", "2022"];

const QUICK_QUESTIONS = [
  "Is this patient eligible for the denominator?",
  "Previous visits or current visit only?",
  "What ICD-10 codes qualify?",
  "What CPT codes trigger this measure?",
  "What must be documented for the numerator?",
  "What are the exclusion criteria?",
  "How is performance rate calculated?",
  "What changed from last year?",
  "Full performance period or single visit?",
  "What are the reporting requirements?",
];

export default function MipsChat() {
  const [measureId, setMeasureId]     = useState("");
  const [year, setYear]               = useState("2025");
  const [draftId, setDraftId]         = useState("");
  const [draftYear, setDraftYear]     = useState("2025");
  const [question, setQuestion]       = useState("");
  const [messages, setMessages]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [pdfData, setPdfData]         = useState(null);
  const [specLoaded, setSpecLoaded]   = useState(false);
  const [specError, setSpecError]     = useState(null);
  const [error, setError]             = useState(null);
  const [showSelector, setShowSelector] = useState(true);  // false = collapsed top bar
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showQuickQ, setShowQuickQ]   = useState(false);
  const messagesEndRef                = useRef(null);
  const inputRef                      = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Load CMS PDF ──────────────────────────────────────────────────────────

  const loadSpec = async (id, yr) => {
    const targetId = id || draftId;
    const targetYear = yr || draftYear;
    if (!targetId.trim()) return;

    setLoadingSpec(true);
    setSpecError(null);
    setPdfData(null);
    setSpecLoaded(false);
    setShowChangeModal(false);

    // If this is a change, add a system message to chat
    if (specLoaded) {
      setMessages(prev => [...prev, {
        role: "system",
        displayContent: `Switching to MIPS #${targetId} (${targetYear})...`,
        timestamp: new Date().toLocaleTimeString(),
      }]);
    }

    try {
      const res = await fetch(`${SERVER}/api/cms/measure/${targetYear}/${targetId.trim()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      setPdfData(data);
      setMeasureId(targetId.trim());
      setYear(targetYear);
      setSpecLoaded(true);
      setShowSelector(false); // collapse to top bar

      const title = data.sections?.measureTitle || `MIPS Measure #${targetId}`;
      const hasData = data.pageCount > 0 && data.charCount > 500;

      setMessages(prev => [...prev, {
        role: "assistant",
        displayContent: hasData
          ? `✅ **MIPS #${targetId} loaded (${targetYear})**\n\n**${title}**\n\n📄 ${data.pageCount} pages · ${(data.charCount/1000).toFixed(1)}K chars from official CMS PDF\n\nAsk me anything — I'm reading from the actual specification document.`
          : `⚠️ **MIPS #${targetId} (${targetYear})** — limited data returned. I'll answer from my training knowledge and flag any uncertainty.`,
        timestamp: new Date().toLocaleTimeString(),
        isSystem: true,
      }]);

    } catch (e) {
      setSpecError(
        e.message.includes("fetch") ? "Server waking up — wait 30s and try again." :
        e.message.includes("not found") ? `Measure #${targetId} not found for ${targetYear}.` :
        e.message
      );
      setShowSelector(true);
    } finally {
      setLoadingSpec(false);
    }
  };

  // ── Send question ─────────────────────────────────────────────────────────

  const sendMessage = async (q) => {
    if (!q.trim() || !specLoaded || !pdfData) return;
    setError(null);
    setShowQuickQ(false);

    const userMsg = { role: "user", displayContent: q, timestamp: new Date().toLocaleTimeString() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setQuestion("");
    setLoading(true);

    try {
      const sections = pdfData.sections || {};
      const pdfContext = `
=== OFFICIAL CMS MIPS MEASURE SPECIFICATION ===
Source: ${pdfData.pdfUrl}
Fetched: ${pdfData.fetchedAt}

${sections.measureTitle     ? `TITLE: ${sections.measureTitle}`           : ""}
${sections.measureType      ? `TYPE: ${sections.measureType}`             : ""}
${sections.description      ? `DESCRIPTION: ${sections.description}`      : ""}
${sections.submissionMethods? `SUBMISSION: ${sections.submissionMethods}` : ""}
${sections.denominator      ? `DENOMINATOR: ${sections.denominator}`      : ""}
${sections.denominatorNote  ? `DENOMINATOR NOTE: ${sections.denominatorNote}` : ""}
${sections.numerator        ? `NUMERATOR: ${sections.numerator}`          : ""}
${sections.exclusions       ? `EXCLUSIONS: ${sections.exclusions}`        : ""}
${sections.exceptions       ? `EXCEPTIONS: ${sections.exceptions}`        : ""}

=== FULL PDF TEXT ===
${pdfData.fullText || ""}`.trim();

      const msgs = [
        { role: "user", content: `You are a MIPS expert for a US EHR application (HIPAA compliant).\n\nOfficial CMS spec for MIPS #${measureId} (${year}):\n\n${pdfContext}\n\nAnswer from the PDF only. Be specific — quote exact codes. State YES/NO/MAYBE for eligibility. Keep answers concise. If not in PDF, say so clearly.` },
        { role: "assistant", content: `Understood. I have the ${pdfData.pageCount}-page CMS spec for MIPS #${measureId} (${year}). Ready.` },
        ...updated.filter(m => m.role !== "system").slice(1).map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.displayContent,
        }))
      ];

      const res = await fetch(`${SERVER}/api/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 1200, messages: msgs }),
      });

      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error?.message || `Error ${res.status}`);
      const data = await res.json();
      const text = data.content?.map(c => c.text||"").join("") || "";

      setMessages(prev => [...prev, { role:"assistant", displayContent:text, timestamp:new Date().toLocaleTimeString() }]);
    } catch (e) {
      setError(e.message.includes("fetch") ? "Server waking up — try again in 30s." : e.message);
      setMessages(prev => prev.slice(0,-1));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (text) => text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height:5 }} />;
    if (line.startsWith('## ')) return <div key={i} style={{ fontSize:14, fontWeight:700, color:"#e2e8f0", marginTop:12, marginBottom:3, fontFamily:"'Bricolage Grotesque',sans-serif" }}>{line.slice(3)}</div>;
    if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ fontWeight:700, color:"#e2e8f0", marginTop:6, fontSize:13 }}>{line.replace(/\*\*/g,'')}</div>;
    if (line.startsWith('- ') || line.startsWith('• ')) return <div key={i} style={{ paddingLeft:12, marginBottom:3, color:"#c9d1d9", fontSize:13, lineHeight:1.6 }}>· {line.slice(2)}</div>;
    const html = line
      .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#e2e8f0;font-weight:700">$1</strong>')
      .replace(/\b([A-Z]\d{2}\.?\d*[A-Z0-9]*)\b/g, '<code style="background:rgba(6,182,212,0.12);color:#22d3ee;padding:1px 5px;border-radius:4px;font-size:11px;font-family:DM Mono,monospace">$1</code>')
      .replace(/\b(\d{5})\b/g,                      '<code style="background:rgba(99,102,241,0.12);color:#818cf8;padding:1px 5px;border-radius:4px;font-size:11px;font-family:DM Mono,monospace">$1</code>');
    return <div key={i} style={{ color:"#9ca3af", fontSize:13, lineHeight:1.75, marginBottom:2 }} dangerouslySetInnerHTML={{ __html:html }} />;
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 65px)", background:"#07080f", fontFamily:"'DM Sans',sans-serif", position:"relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono&family=Bricolage+Grotesque:wght@700;800&display=swap');
        .mi { background:#0d0f1a; border:1.5px solid #1e2030; color:#e2e8f0; padding:12px 14px; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:15px; outline:none; width:100%; }
        .mi:focus { border-color:rgba(6,182,212,0.5); }
        .load-btn { background:linear-gradient(135deg,#06b6d4,#6366f1); border:none; color:white; padding:16px; border-radius:12px; cursor:pointer; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:16px; width:100%; transition:all 0.2s; min-height:54px; }
        .load-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .send-btn { background:linear-gradient(135deg,#06b6d4,#6366f1); border:none; color:white; width:48px; height:48px; border-radius:12px; cursor:pointer; font-size:20px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.2s; }
        .send-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .quick-chip { padding:10px 16px; border-radius:20px; border:1.5px solid #1e2030; background:rgba(255,255,255,0.02); color:#6b7280; font-size:13px; cursor:pointer; transition:all 0.15s; white-space:nowrap; font-family:'DM Sans',sans-serif; }
        .quick-chip:hover { border-color:rgba(6,182,212,0.4); color:#22d3ee; }
        .spin { animation:spin 1s linear infinite; display:inline-block; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .fade { animation:fi 0.3s ease-out; }
        @keyframes fi { from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;} }
        .typing-dot { width:7px; height:7px; border-radius:50%; background:#374151; animation:bounce 1.2s infinite; }
        .typing-dot:nth-child(2){animation-delay:0.2s;}
        .typing-dot:nth-child(3){animation-delay:0.4s;}
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);} 30%{transform:translateY(-6px);} }
        .overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:200; display:flex; align-items:flex-end; }
        .modal { background:#0d0f1a; border:1.5px solid #1e2030; border-radius:20px 20px 0 0; padding:24px; width:100%; }
      `}</style>

      {/* ── TOP BAR ── */}
      {showSelector ? (
        /* SETUP SCREEN — measure not loaded yet */
        <div style={{ flex:1, overflowY:"auto", padding:"24px 20px 100px" }}>
          <div style={{ maxWidth:480, margin:"0 auto" }}>
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <div style={{ fontSize:52, marginBottom:12 }}>🏥</div>
              <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:24, fontWeight:800, color:"#e2e8f0", marginBottom:8 }}>
                MIPS Expert
              </div>
              <div style={{ fontSize:14, color:"#4b5563", lineHeight:1.7 }}>
                Enter a measure ID and year to load the official CMS specification. I'll read the full PDF and answer your questions from the actual document.
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <div style={{ fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:8, fontWeight:600 }}>Measure ID</div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ color:"#22d3ee", fontSize:22, fontWeight:800, fontFamily:"'Bricolage Grotesque',sans-serif" }}>#</span>
                  <input className="mi" value={draftId} placeholder="e.g. 130"
                    onChange={e => setDraftId(e.target.value.replace(/\D/g,""))}
                    onKeyDown={e => e.key==="Enter" && loadSpec()} style={{ fontSize:20, fontWeight:700 }} />
                </div>
              </div>

              <div>
                <div style={{ fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:8, fontWeight:600 }}>Performance Year</div>
                <select className="mi" value={draftYear} onChange={e => setDraftYear(e.target.value)} style={{ fontSize:16 }}>
                  {YEARS.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>

              {specError && (
                <div style={{ background:"rgba(248,113,113,0.08)", border:"1.5px solid rgba(248,113,113,0.2)", borderRadius:12, padding:"12px 16px", color:"#f87171", fontSize:13 }}>
                  ⚠️ {specError}
                </div>
              )}

              <button className="load-btn" onClick={() => loadSpec()} disabled={!draftId.trim() || loadingSpec}>
                {loadingSpec ? <><span className="spin">⚡</span> Downloading CMS PDF...</> : "📄 Load Measure Spec"}
              </button>

              {/* Common measure IDs hint */}
              <div style={{ marginTop:8 }}>
                <div style={{ fontSize:11, color:"#374151", marginBottom:10, textTransform:"uppercase", letterSpacing:"1px" }}>Common Measures</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {[["001","Diabetes HbA1c"],["130","Documentation"],["226","Tobacco"],["236","Control HTN"],["317","Prev Care"]].map(([id,label]) => (
                    <button key={id} onClick={() => { setDraftId(id); }}
                      style={{ padding:"8px 14px", borderRadius:20, border:"1.5px solid #1e2030", background: draftId===id?"rgba(6,182,212,0.12)":"rgba(255,255,255,0.02)", color:draftId===id?"#22d3ee":"#4b5563", fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s" }}>
                      #{id} {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

      ) : (
        /* CHAT MODE — measure loaded */
        <>
          {/* Compact measure bar */}
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #1a1c2e", background:"#0d0f1a", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#06b6d4,#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🏥</div>
              <div>
                <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:14, fontWeight:800, color:"#e2e8f0" }}>
                  MIPS #{measureId}
                </div>
                <div style={{ fontSize:11, color:"#4b5563" }}>
                  {year} · {pdfData?.pageCount}p · {(pdfData?.charCount/1000).toFixed(1)}K chars
                  {pdfData?.cached && " · 📦 cached"}
                </div>
              </div>
            </div>
            <button onClick={() => { setShowChangeModal(true); setDraftId(measureId); setDraftYear(year); }}
              style={{ padding:"8px 14px", borderRadius:8, border:"1.5px solid #1e2030", background:"transparent", color:"#4b5563", fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
              Change ↗
            </button>
          </div>

          {/* Chat messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:12, paddingBottom:8 }}>

            {messages.map((msg, i) => {
              if (msg.role === "system") return (
                <div key={i} style={{ textAlign:"center", fontSize:11, color:"#374151", padding:"4px 0" }}>— {msg.displayContent} —</div>
              );

              return (
                <div key={i} className="fade" style={{ display:"flex", flexDirection:msg.role==="user"?"row-reverse":"row", gap:8, alignItems:"flex-end" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width:28, height:28, borderRadius:8, background:"rgba(6,182,212,0.12)", border:"1px solid rgba(6,182,212,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, marginBottom:4 }}>🏥</div>
                  )}
                  <div style={{
                    maxWidth:"82%",
                    background: msg.role==="user" ? "linear-gradient(135deg,#06b6d4,#6366f1)" : msg.isSystem ? "rgba(74,222,128,0.06)" : "#111827",
                    border: msg.role!=="user" ? `1px solid ${msg.isSystem?"rgba(74,222,128,0.18)":"#1e2030"}` : "none",
                    borderRadius: msg.role==="user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                    padding: "12px 16px",
                  }}>
                    {msg.role==="user"
                      ? <div style={{ color:"white", fontSize:14, lineHeight:1.6 }}>{msg.displayContent}</div>
                      : <div>{fmt(msg.displayContent)}</div>
                    }
                    <div style={{ fontSize:9, color:msg.role==="user"?"rgba(255,255,255,0.4)":"#1f2937", marginTop:6, textAlign:msg.role==="user"?"right":"left" }}>
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                <div style={{ width:28, height:28, borderRadius:8, background:"rgba(6,182,212,0.12)", border:"1px solid rgba(6,182,212,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>🏥</div>
                <div style={{ background:"#111827", border:"1px solid #1e2030", borderRadius:"4px 18px 18px 18px", padding:"14px 18px", display:"flex", gap:6, alignItems:"center" }}>
                  <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                </div>
              </div>
            )}

            {error && (
              <div style={{ background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:12, padding:"10px 14px", color:"#f87171", fontSize:13 }}>⚠️ {error}</div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick questions strip */}
          {showQuickQ && (
            <div style={{ padding:"8px 16px", borderTop:"1px solid #1a1c2e", overflowX:"auto", display:"flex", gap:8 }}>
              {QUICK_QUESTIONS.map((q,i) => (
                <button key={i} className="quick-chip" onClick={() => sendMessage(q)}>{q}</button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div style={{ padding:"12px 16px", borderTop:"1px solid #1a1c2e", background:"#07080f", paddingBottom:"calc(12px + env(safe-area-inset-bottom))" }}>
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              {/* Quick Q toggle */}
              <button onClick={() => setShowQuickQ(!showQuickQ)}
                style={{ width:48, height:48, borderRadius:12, border:"1.5px solid", borderColor:showQuickQ?"rgba(6,182,212,0.5)":"#1e2030", background:showQuickQ?"rgba(6,182,212,0.08)":"transparent", color:showQuickQ?"#22d3ee":"#374151", fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                💡
              </button>

              <textarea ref={inputRef} className="mi" value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(question); } }}
                placeholder="Ask about this measure..."
                rows={1} style={{ resize:"none", lineHeight:1.6, padding:"12px 14px", minHeight:48, maxHeight:120, overflowY:"auto" }}
                onInput={e => { e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"; }}
              />

              <button className="send-btn" onClick={() => sendMessage(question)} disabled={loading || !question.trim()}>
                {loading ? <span className="spin" style={{ fontSize:16 }}>⚡</span> : "→"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Change Measure Modal ── */}
      {showChangeModal && (
        <div className="overlay" onClick={e => { if(e.target===e.currentTarget) setShowChangeModal(false); }}>
          <div className="modal fade">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:18, fontWeight:800, color:"#e2e8f0" }}>
                Change Measure
              </div>
              <button onClick={() => setShowChangeModal(false)} style={{ background:"none", border:"none", color:"#4b5563", fontSize:22, cursor:"pointer" }}>✕</button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <div style={{ fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:8, fontWeight:600 }}>Measure ID</div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ color:"#22d3ee", fontSize:20, fontWeight:800 }}>#</span>
                  <input className="mi" value={draftId} placeholder="e.g. 226"
                    onChange={e => setDraftId(e.target.value.replace(/\D/g,""))}
                    onKeyDown={e => e.key==="Enter" && loadSpec(draftId, draftYear)}
                    style={{ fontSize:18, fontWeight:700 }} autoFocus />
                </div>
              </div>

              <div>
                <div style={{ fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:8, fontWeight:600 }}>Year</div>
                <select className="mi" value={draftYear} onChange={e => setDraftYear(e.target.value)}>
                  {YEARS.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>

              {specError && <div style={{ background:"rgba(248,113,113,0.08)", border:"1.5px solid rgba(248,113,113,0.2)", borderRadius:10, padding:"10px 14px", color:"#f87171", fontSize:13 }}>⚠️ {specError}</div>}

              <button className="load-btn" onClick={() => loadSpec(draftId, draftYear)} disabled={!draftId.trim() || loadingSpec}>
                {loadingSpec ? <><span className="spin">⚡</span> Loading...</> : `📄 Load MIPS #${draftId || "?"} (${draftYear})`}
              </button>

              {/* Quick picks */}
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, paddingTop:4 }}>
                {[["001","HbA1c"],["130","Documentation"],["226","Tobacco"],["236","HTN"],["317","Preventive"]].map(([id,label]) => (
                  <button key={id} onClick={() => setDraftId(id)}
                    style={{ padding:"8px 12px", borderRadius:20, border:"1.5px solid", borderColor:draftId===id?"rgba(6,182,212,0.5)":"#1e2030", background:draftId===id?"rgba(6,182,212,0.08)":"transparent", color:draftId===id?"#22d3ee":"#4b5563", fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                    #{id} {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}