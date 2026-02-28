/**
 * MipsChat.jsx — MIPS Expert with PDF RAG
 * 
 * Flow:
 * 1. User enters Measure ID + Year
 * 2. Server downloads official CMS PDF
 * 3. PDF text extracted and returned
 * 4. AI reads ACTUAL spec text → accurate answers
 */

import { useState, useRef, useEffect } from "react";

const SERVER = "https://codescan-server.onrender.com";
const YEARS  = ["2026", "2025", "2024", "2023", "2022"];

const SUGGESTED_QUESTIONS = [
  "Is this patient eligible for the denominator?",
  "Do I look at previous visits or only the current visit?",
  "What ICD-10 codes qualify for the denominator?",
  "What CPT codes trigger this measure?",
  "What must be documented to meet the numerator?",
  "What are the exclusion criteria?",
  "How is the performance rate calculated?",
  "What changed from last year?",
  "Does this require data from the entire performance period?",
  "What are the reporting requirements?",
];

export default function MipsChat() {
  const [measureId, setMeasureId]     = useState("");
  const [year, setYear]               = useState("2025");
  const [question, setQuestion]       = useState("");
  const [messages, setMessages]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [pdfData, setPdfData]         = useState(null);
  const [specLoaded, setSpecLoaded]   = useState(false);
  const [specError, setSpecError]     = useState(null);
  const [error, setError]             = useState(null);
  const messagesEndRef                = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Load CMS PDF ──────────────────────────────────────────────────────────

  const loadSpec = async () => {
    if (!measureId.trim()) return;
    setLoadingSpec(true);
    setSpecError(null);
    setPdfData(null);
    setSpecLoaded(false);
    setMessages([]);

    try {
      const res = await fetch(`${SERVER}/api/cms/measure/${year}/${measureId.trim()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      setPdfData(data);
      setSpecLoaded(true);

      // Show what we extracted from the PDF
      const sections = data.sections || {};
      const title = sections.measureTitle || `MIPS Measure #${measureId}`;
      const hasGoodData = data.pageCount > 0 && data.charCount > 500;

      setMessages([{
        role: "assistant",
        displayContent: hasGoodData
          ? `✅ **Official CMS PDF loaded for MIPS #${measureId} (${year})**\n\n**${title}**\n\n📄 ${data.pageCount} pages · ${(data.charCount / 1000).toFixed(1)}K characters extracted\n🌐 Source: ${data.pdfUrl}\n${data.cached ? "📦 Served from cache" : "🔄 Freshly downloaded"}\n\nI'm reading directly from the official CMS specification document. Ask me anything about this measure — my answers will be based on the actual PDF content.`
          : `⚠️ PDF loaded but with limited content for MIPS #${measureId} (${year}). I'll answer based on available data.`,
        timestamp: new Date().toLocaleTimeString(),
        isSystem: true,
      }]);

    } catch (e) {
      const msg = e.message;
      setSpecError(
        msg.includes("fetch") ? "Server is waking up — wait 30 seconds and try again." :
        msg.includes("not found") ? `Measure #${measureId} PDF not found for ${year}. Check the measure ID is correct.` :
        msg
      );
    } finally {
      setLoadingSpec(false);
    }
  };

  // ── Send question ─────────────────────────────────────────────────────────

  const sendMessage = async (q) => {
    if (!q.trim() || !specLoaded || !pdfData) return;
    setError(null);

    const userMsg = { role: "user", displayContent: q, timestamp: new Date().toLocaleTimeString() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setQuestion("");
    setLoading(true);

    try {
      const sections = pdfData.sections || {};

      // Build rich context from the actual PDF
      const pdfContext = `
=== OFFICIAL CMS MIPS MEASURE SPECIFICATION ===
Source: ${pdfData.pdfUrl}
Downloaded: ${pdfData.fetchedAt}
Pages: ${pdfData.pageCount} | Size: ${pdfData.charCount} characters

${sections.measureTitle  ? `MEASURE TITLE:\n${sections.measureTitle}\n` : ""}
${sections.measureType   ? `MEASURE TYPE:\n${sections.measureType}\n` : ""}
${sections.description   ? `DESCRIPTION:\n${sections.description}\n` : ""}
${sections.submissionMethods ? `SUBMISSION METHODS:\n${sections.submissionMethods}\n` : ""}
${sections.denominator   ? `DENOMINATOR:\n${sections.denominator}\n` : ""}
${sections.denominatorNote ? `DENOMINATOR NOTE:\n${sections.denominatorNote}\n` : ""}
${sections.numerator     ? `NUMERATOR:\n${sections.numerator}\n` : ""}
${sections.exclusions    ? `EXCLUSIONS:\n${sections.exclusions}\n` : ""}
${sections.exceptions    ? `EXCEPTIONS:\n${sections.exceptions}\n` : ""}

=== FULL PDF TEXT (first 12000 chars) ===
${pdfData.fullText || ""}
      `.trim();

      const systemPrompt = `You are a MIPS expert consultant for a US EHR application (HIPAA compliant).

You have the COMPLETE official CMS specification document for MIPS Measure #${measureId} (${year} Performance Year) extracted directly from the CMS PDF.

${pdfContext}

Rules for answering:
- Answer ONLY from the PDF content above — do not guess or use outside knowledge
- Be specific: quote exact CPT/ICD-10 codes from the document when relevant
- For denominator questions: state clearly YES/NO/MAYBE with exact criteria from the PDF
- For numerator: state exactly what must be documented
- For performance period: state exactly what the PDF says about lookback periods
- If something is NOT in the PDF, say "The specification does not address this — check qpp.cms.gov"
- Keep answers concise and actionable — providers are busy
- Flag any HIPAA documentation requirements you find in the spec`;

      const conversationMessages = [
        { role: "user",      content: systemPrompt },
        { role: "assistant", content: `Understood. I have read the complete ${pdfData.pageCount}-page CMS specification for MIPS #${measureId} (${year}). I will answer strictly from the PDF content. Ready for questions.` },
        ...updated.slice(1).map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.displayContent,
        }))
      ];

      const res = await fetch(`${SERVER}/api/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 1200, messages: conversationMessages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Server error ${res.status}`);
      }

      const data = await res.json();
      const text = data.content?.map(c => c.text || "").join("") || "";

      setMessages(prev => [...prev, {
        role: "assistant",
        displayContent: text,
        timestamp: new Date().toLocaleTimeString(),
      }]);

    } catch (e) {
      setError(e.message.includes("fetch") ? "Server is waking up — try again in 30 seconds." : e.message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (text) => text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
    if (line.startsWith('## '))  return <div key={i} style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", marginTop: 14, marginBottom: 4, fontFamily: "'Syne',sans-serif" }}>{line.slice(3)}</div>;
    if (line.startsWith('# '))   return <div key={i} style={{ fontSize: 15, fontWeight: 800, color: "#4db8ff", marginTop: 14, marginBottom: 6, fontFamily: "'Syne',sans-serif" }}>{line.slice(2)}</div>;
    if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ fontWeight: 700, color: "#e2e8f0", marginTop: 8, fontSize: 13 }}>{line.replace(/\*\*/g, '')}</div>;
    if (line.startsWith('- ') || line.startsWith('• ')) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, color: "#c9d1d9", fontSize: 13, lineHeight: 1.6 }}>· {line.slice(2)}</div>;
    if (line.match(/^\d+\./)) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, color: "#c9d1d9", fontSize: 13 }}>{line}</div>;
    const html = line
      .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>')
      .replace(/\b([A-Z]\d{2}\.?\d*[A-Z0-9]*)\b/g, '<code style="background:rgba(77,184,255,0.1);color:#4db8ff;padding:1px 5px;border-radius:3px;font-size:11px">$1</code>')
      .replace(/\b(\d{5})\b/g, '<code style="background:rgba(168,85,247,0.1);color:#a855f7;padding:1px 5px;border-radius:3px;font-size:11px">$1</code>');
    return <div key={i} style={{ color: "#a0aec0", fontSize: 13, lineHeight: 1.7, marginBottom: 2 }} dangerouslySetInnerHTML={{ __html: html }} />;
  });

  return (
    <div style={{ display: "flex", height: "calc(100vh - 115px)", fontFamily: "'JetBrains Mono',monospace" }}>
      <style>{`
        .mi { background:#0d0d15; border:1px solid #1e1e2e; color:#e2e8f0; padding:9px 12px;
          border-radius:6px; font-family:'JetBrains Mono',monospace; font-size:13px; outline:none; }
        .mi:focus { border-color:rgba(77,184,255,0.4); }
        .load-btn { background:linear-gradient(135deg,#4ade80,#22d3ee); border:none; color:#0a0a0f;
          padding:10px; border-radius:6px; cursor:pointer; font-family:'Syne',sans-serif;
          font-weight:800; font-size:12px; width:100%; transition:all 0.2s; }
        .load-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .send-btn { background:linear-gradient(135deg,#4db8ff,#a855f7); border:none; color:white;
          padding:10px 20px; border-radius:6px; cursor:pointer; font-family:'Syne',sans-serif;
          font-weight:800; font-size:13px; transition:all 0.2s; }
        .send-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .chip { padding:5px 10px; border-radius:20px; border:1px solid #1e1e2e; background:rgba(255,255,255,0.02);
          color:#555; font-size:11px; cursor:pointer; transition:all 0.15s; text-align:left; width:100%; margin-bottom:4px; }
        .chip:hover { border-color:rgba(77,184,255,0.3); color:#4db8ff; }
        .chip:disabled { opacity:0.3; cursor:not-allowed; }
        .spin { animation:spin 1s linear infinite; display:inline-block; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .fade { animation:fi 0.3s ease-out; }
        @keyframes fi { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
      `}</style>

      {/* ── Left Panel ── */}
      <div style={{ width: 300, borderRight: "1px solid #1a1a2e", display: "flex", flexDirection: "column", background: "#0d0d15", flexShrink: 0 }}>

        <div style={{ padding: 16, borderBottom: "1px solid #1a1a2e" }}>
          <div style={{ fontSize: 10, color: "#4db8ff", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 14, fontWeight: 600 }}>
            🏥 MIPS Measure Lookup
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 }}>Measure ID</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: "#4db8ff", fontWeight: 700, fontSize: 16 }}>#</span>
              <input className="mi" value={measureId} placeholder="e.g. 130"
                onChange={e => setMeasureId(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => e.key === "Enter" && loadSpec()}
                style={{ flex: 1 }} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 }}>Performance Year</div>
            <select className="mi" value={year} onChange={e => setYear(e.target.value)} style={{ width: "100%" }}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>

          <button className="load-btn" onClick={loadSpec} disabled={!measureId.trim() || loadingSpec}>
            {loadingSpec
              ? <><span className="spin">⚡</span> Downloading CMS PDF...</>
              : "📄 Load Official CMS PDF"
            }
          </button>

          {specError && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#ff4d4d", background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.15)", borderRadius: 6, padding: "8px 10px" }}>
              ⚠️ {specError}
            </div>
          )}
        </div>

        {/* PDF Info */}
        {pdfData && (
          <div style={{ padding: 16, borderBottom: "1px solid #1a1a2e" }} className="fade">
            <div style={{ fontSize: 10, color: "#4ade80", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10, fontWeight: 600 }}>
              ✅ PDF Loaded
            </div>
            {[
              ["Title",   pdfData.sections?.measureTitle?.slice(0, 60)],
              ["Type",    pdfData.sections?.measureType],
              ["Pages",   pdfData.pageCount + " pages"],
              ["Size",    (pdfData.charCount / 1000).toFixed(1) + "K chars extracted"],
              ["Status",  pdfData.cached ? "📦 Cached (fast)" : "🌐 Fresh download"],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: "1px" }}>{l}</div>
                <div style={{ fontSize: 11, color: "#a0aec0", lineHeight: 1.4 }}>{v}</div>
              </div>
            ))}
            <a href={pdfData.pdfUrl} target="_blank" rel="noreferrer"
              style={{ fontSize: 10, color: "#4db8ff", textDecoration: "none", marginTop: 6, display: "block" }}>
              📎 View original PDF →
            </a>
          </div>
        )}

        {/* Suggested Questions */}
        <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          <div style={{ fontSize: 10, color: "#333", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Quick Questions</div>
          {SUGGESTED_QUESTIONS.map((q, i) => (
            <button key={i} className="chip" onClick={() => setQuestion(q)} disabled={!specLoaded}>{q}</button>
          ))}
        </div>
      </div>

      {/* ── Right Chat Panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {messages.length === 0 && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, opacity: 0.4 }}>
              <div style={{ fontSize: 52 }}>🏥</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: "#e2e8f0" }}>MIPS Expert Assistant</div>
              <div style={{ fontSize: 12, color: "#555", textAlign: "center", maxWidth: 420, lineHeight: 1.8 }}>
                Enter a <span style={{ color: "#4db8ff" }}>Measure ID</span> + <span style={{ color: "#4db8ff" }}>Year</span> and click <strong>Load Official CMS PDF</strong>.<br /><br />
                The server downloads the <strong>actual CMS specification PDF</strong> from qpp.cms.gov, extracts all text, and feeds it directly to the AI — so answers come from the real document, not memory.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {["📄 Real PDF Content", "🌐 qpp.cms.gov", "📦 Cached 7 days", "2022–2025"].map(t => (
                  <span key={t} style={{ fontSize: 10, padding: "4px 12px", borderRadius: 20, background: "rgba(77,184,255,0.08)", border: "1px solid rgba(77,184,255,0.15)", color: "#4db8ff" }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="fade" style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: 10, alignItems: "flex-start" }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 15,
                background: msg.role === "user" ? "linear-gradient(135deg,#4db8ff,#a855f7)" : "rgba(74,222,128,0.1)",
                border: msg.role !== "user" ? "1px solid rgba(74,222,128,0.2)" : "none",
              }}>
                {msg.role === "user" ? "👤" : "🏥"}
              </div>
              <div style={{
                maxWidth: "80%",
                background: msg.role === "user" ? "rgba(77,184,255,0.07)" : msg.isSystem ? "rgba(74,222,128,0.04)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${msg.role === "user" ? "rgba(77,184,255,0.18)" : msg.isSystem ? "rgba(74,222,128,0.18)" : "#1e1e2e"}`,
                borderRadius: msg.role === "user" ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
                padding: "12px 16px",
              }}>
                {fmt(msg.displayContent)}
                <div style={{ fontSize: 9, color: "#2a2a3a", marginTop: 8, textAlign: msg.role === "user" ? "right" : "left" }}>{msg.timestamp}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)" }}>🏥</div>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1e1e2e", borderRadius: "2px 12px 12px 12px", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <span className="spin">⚡</span>
                <span style={{ fontSize: 12, color: "#555" }}>Reading CMS PDF for Measure #{measureId}...</span>
              </div>
            </div>
          )}

          {error && <div style={{ background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: 8, padding: "10px 14px", color: "#ff4d4d", fontSize: 12 }}>⚠️ {error}</div>}
          <div ref={messagesEndRef} />
        </div>

        {specLoaded && messages.length > 1 && (
          <div style={{ padding: "6px 20px", borderTop: "1px solid #1a1a2e", display: "flex", gap: 6, overflowX: "auto" }}>
            {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
              <button key={i} onClick={() => setQuestion(q)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: "1px solid #1e1e2e", background: "transparent", color: "#555", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>{q}</button>
            ))}
          </div>
        )}

        <div style={{ padding: "12px 20px", borderTop: "1px solid #1a1a2e", background: "#0a0a0f" }}>
          {!specLoaded ? (
            <div style={{ textAlign: "center", padding: 14, fontSize: 12, color: "#2a2a3a", border: "1px dashed #1a1a2e", borderRadius: 6 }}>
              ← Load the CMS PDF first to start asking questions
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <textarea className="mi" value={question} rows={2}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(question); } }}
                placeholder={`Ask about MIPS #${measureId} (${year}) — answers from the actual CMS PDF...`}
                style={{ flex: 1, resize: "none", lineHeight: 1.5 }}
              />
              <button className="send-btn" onClick={() => sendMessage(question)} disabled={loading || !question.trim()}>
                {loading ? <span className="spin">⚡</span> : "Ask →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}