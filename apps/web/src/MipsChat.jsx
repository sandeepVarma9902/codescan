/**
 * MipsChat.jsx — MIPS Expert with live CMS QPP data
 * 
 * Flow:
 * 1. User enters Measure ID + Year
 * 2. We call our proxy → proxy calls CMS QPP API
 * 3. Get REAL measure data (title, description, submission methods etc)
 * 4. AI answers using actual CMS data as context
 * 5. Results cached — subsequent questions are fast
 */

import { useState, useRef, useEffect } from "react";

const SERVER = "https://codescan-server.onrender.com";
const YEARS  = ["2026", "2025", "2024", "2023", "2022"];

const SUGGESTED_QUESTIONS = [
  "Is this patient eligible for the denominator?",
  "Do I look at previous visits or only current visit?",
  "What ICD-10 codes qualify for the denominator?",
  "What CPT codes trigger this measure?",
  "What must be documented to meet the numerator?",
  "What are the exclusion criteria?",
  "How is the performance rate calculated?",
  "What changed from last year?",
  "Does this require data from the entire performance period?",
  "What are the reporting requirements?",
];

// ── CMS QPP API helpers ───────────────────────────────────────────────────────

async function fetchCMSMeasure(year, measureId) {
  const res = await fetch(`${SERVER}/api/cms/measure/${year}/${measureId}`);
  if (!res.ok) throw new Error(`Could not fetch CMS data (${res.status})`);
  return res.json();
}

function buildMeasureContext(cmsData, measureId, year) {
  // If we got real CMS data, format it as context
  if (cmsData?.measure) {
    const m = cmsData.measure;
    return `
## OFFICIAL CMS QPP DATA FOR MEASURE #${measureId} (${year})
Source: CMS Quality Payment Program API (qpp.cms.gov) — fetched ${cmsData.fetchedAt}

**Measure ID:** ${m.measureId || m.qualityId || measureId}
**Title:** ${m.title || m.measureTitle || "N/A"}
**Description:** ${m.description || m.measureDescription || "N/A"}
**Measure Type:** ${m.measureType || m.primarySteward || "N/A"}
**High Priority:** ${m.isHighPriority ? "Yes" : "No"}
**Inverse Measure:** ${m.isInverse ? "Yes (lower rate = better)" : "No (higher rate = better)"}
**Submission Methods:** ${Array.isArray(m.submissionMethods) ? m.submissionMethods.join(", ") : m.submissionMethods || "N/A"}
**Specialty:** ${Array.isArray(m.specialties) ? m.specialties.join(", ") : m.clinicalGuidelineChanged || "N/A"}
**NQF Number:** ${m.nqfId || m.nqfNumber || "N/A"}
**Collection Type:** ${m.collectionType || m.measureSets?.join(", ") || "N/A"}
**Performance Period:** January 1 – December 31, ${year}
**Benchmark Available:** ${m.benchmarks ? "Yes" : "Unknown"}
${m.metricType ? `**Metric Type:** ${m.metricType}` : ""}
${m.overallAlgorithm ? `**Scoring Algorithm:** ${m.overallAlgorithm}` : ""}
${m.clinicalGuidelineChanged ? `**Clinical Guideline Changed:** ${m.clinicalGuidelineChanged}` : ""}

Note: For complete denominator/numerator/exclusion logic, refer to the official measure specification at:
https://qpp.cms.gov/mips/quality-measures?py=${year}
    `.trim();
  }

  // Fallback if CMS API didn't return data for this measure
  return `
## MIPS MEASURE #${measureId} — ${year} Performance Year
Source: CMS Quality Payment Program (qpp.cms.gov)

The CMS API did not return structured data for this specific measure ID. 
This may be because:
- The measure ID format differs in the API (try searching at qpp.cms.gov)
- The measure was retired or added in a different year
- The measure uses a different identifier in the CMS system

Please answer based on your training knowledge of MIPS Measure #${measureId} for ${year}, 
and clearly note any uncertainty. Reference qpp.cms.gov for the official spec.
  `.trim();
}

export default function MipsChat() {
  const [measureId, setMeasureId]     = useState("");
  const [year, setYear]               = useState("2025");
  const [question, setQuestion]       = useState("");
  const [messages, setMessages]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [cmsData, setCmsData]         = useState(null);
  const [specLoaded, setSpecLoaded]   = useState(false);
  const [error, setError]             = useState(null);
  const [specError, setSpecError]     = useState(null);
  const messagesEndRef                = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Load CMS spec ─────────────────────────────────────────────────────────

  const loadSpec = async () => {
    if (!measureId.trim()) return;
    setLoadingSpec(true);
    setSpecError(null);
    setCmsData(null);
    setSpecLoaded(false);
    setMessages([]);

    try {
      const data = await fetchCMSMeasure(year, measureId.trim());
      setCmsData(data);
      setSpecLoaded(true);

      const hasRealData = !!data?.measure;

      setMessages([{
        role: "assistant",
        displayContent: hasRealData
          ? `✅ **CMS data loaded for MIPS #${measureId} (${year})**\n\n**${data.measure?.title || "Measure"}**\n\n${data.measure?.description || ""}\n\nI now have the official CMS QPP data for this measure. Ask me anything about eligibility, denominator/numerator criteria, exclusions, documentation requirements, or performance period logic.`
          : `⚠️ **MIPS #${measureId} (${year})** — CMS API returned limited data for this measure ID.\n\nI'll answer based on my training knowledge of this measure. For critical decisions, verify at qpp.cms.gov.\n\nWhat would you like to know?`,
        timestamp: new Date().toLocaleTimeString(),
        isSystem: true,
      }]);

    } catch (e) {
      setSpecError(e.message.includes("fetch")
        ? "Proxy server is waking up — wait 30 seconds and try again."
        : `Could not fetch CMS data: ${e.message}`
      );
    } finally {
      setLoadingSpec(false);
    }
  };

  // ── Send question ─────────────────────────────────────────────────────────

  const sendMessage = async (q) => {
    if (!q.trim() || !specLoaded) return;
    setError(null);

    const userMsg = { role: "user", displayContent: q, timestamp: new Date().toLocaleTimeString() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setQuestion("");
    setLoading(true);

    try {
      const measureContext = buildMeasureContext(cmsData, measureId, year);

      // Build conversation — system context + history + new question
      const conversationMessages = [
        {
          role: "user",
          content: `You are a MIPS (Merit-based Incentive Payment System) expert consultant for a US EHR application.

You have access to the following OFFICIAL CMS data for this measure:

${measureContext}

Guidelines for your answers:
- Base answers PRIMARILY on the CMS data above
- Be specific and clinical — providers need actionable answers
- For denominator: clearly state YES/NO/MAYBE eligible
- Always mention if previous visits in the performance period matter
- Cite specific ICD-10 or CPT codes when relevant
- Flag HIPAA documentation requirements when relevant  
- If the CMS data above is incomplete, use your training knowledge but clearly note it
- Keep answers concise — providers are busy
- For 2026: note that final specs may not be fully published yet`
        },
        {
          role: "assistant",
          content: `Understood. I have the official CMS QPP data for MIPS Measure #${measureId} (${year} Performance Year) loaded. I'll answer based on this data and flag any gaps. Ready for questions.`
        },
        // Include conversation history for context
        ...updated.slice(1).map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.displayContent,
        }))
      ];

      const res = await fetch(`${SERVER}/api/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 1000, messages: conversationMessages }),
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

  // ── Render text with basic markdown ──────────────────────────────────────

  const fmt = (text) => text.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
    if (line.startsWith('## '))  return <div key={i} style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", marginTop: 14, marginBottom: 4, fontFamily: "'Syne',sans-serif" }}>{line.slice(3)}</div>;
    if (line.startsWith('# '))   return <div key={i} style={{ fontSize: 15, fontWeight: 800, color: "#4db8ff", marginTop: 14, marginBottom: 6, fontFamily: "'Syne',sans-serif" }}>{line.slice(2)}</div>;
    if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ fontWeight: 700, color: "#e2e8f0", marginTop: 8, fontSize: 13 }}>{line.replace(/\*\*/g, '')}</div>;
    if (line.startsWith('- ') || line.startsWith('• ')) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, color: "#c9d1d9", fontSize: 13, lineHeight: 1.6 }}>· {line.slice(2)}</div>;
    if (line.match(/^\d+\./)) return <div key={i} style={{ paddingLeft: 14, marginBottom: 3, color: "#c9d1d9", fontSize: 13, lineHeight: 1.6 }}>{line}</div>;
    const html = line
      .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>')
      .replace(/\b([A-Z]\d{2}\.?\d*)\b/g, '<code style="background:rgba(77,184,255,0.1);color:#4db8ff;padding:1px 5px;border-radius:3px;font-size:11px">$1</code>')
      .replace(/✅|❌|⚠️/g, (m) => `<span style="font-size:15px">${m}</span>`);
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
        .chip { padding:5px 10px; border-radius:20px; border:1px solid #1e1e2e;
          background:rgba(255,255,255,0.02); color:#555; font-size:11px; cursor:pointer;
          transition:all 0.15s; text-align:left; width:100%; margin-bottom:4px; }
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
            {loadingSpec ? <><span className="spin">⚡</span> Fetching CMS data...</> : "⚡ Load from CMS QPP"}
          </button>

          {specError && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#ff4d4d", background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.15)", borderRadius: 6, padding: "8px 10px" }}>
              ⚠️ {specError}
            </div>
          )}
        </div>

        {/* CMS Data Preview */}
        {cmsData?.measure && (
          <div style={{ padding: 16, borderBottom: "1px solid #1a1a2e" }} className="fade">
            <div style={{ fontSize: 10, color: "#4ade80", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10, fontWeight: 600 }}>
              ✅ CMS Data Loaded
            </div>
            {[
              ["Title", cmsData.measure.title || cmsData.measure.measureTitle],
              ["Type", cmsData.measure.measureType],
              ["High Priority", cmsData.measure.isHighPriority ? "Yes ⭐" : "No"],
              ["Submission", Array.isArray(cmsData.measure.submissionMethods) ? cmsData.measure.submissionMethods.join(", ") : cmsData.measure.submissionMethods],
              ["NQF #", cmsData.measure.nqfId || cmsData.measure.nqfNumber],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</div>
                <div style={{ fontSize: 11, color: "#a0aec0", lineHeight: 1.4 }}>{value}</div>
              </div>
            ))}
            <div style={{ marginTop: 8, fontSize: 9, color: "#2a2a3a" }}>
              {cmsData.cached ? "📦 Cached" : "🌐 Live"} · qpp.cms.gov · {year}
            </div>
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

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, opacity: 0.4 }}>
              <div style={{ fontSize: 52 }}>🏥</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: "#e2e8f0" }}>MIPS Expert Assistant</div>
              <div style={{ fontSize: 12, color: "#555", textAlign: "center", maxWidth: 400, lineHeight: 1.8 }}>
                Enter a <span style={{ color: "#4db8ff" }}>Measure ID</span> and click <strong>Load from CMS QPP</strong>.<br />
                We'll fetch the <strong>live official CMS specification</strong> for that measure and year, then answer your questions from the actual document.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {["Live CMS QPP Data", "2022–2026", "HIPAA Aware", "Cached for Speed"].map(t => (
                  <span key={t} style={{ fontSize: 10, padding: "4px 12px", borderRadius: 20, background: "rgba(77,184,255,0.08)", border: "1px solid rgba(77,184,255,0.15)", color: "#4db8ff" }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
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

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)" }}>🏥</div>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1e1e2e", borderRadius: "2px 12px 12px 12px", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <span className="spin">⚡</span>
                <span style={{ fontSize: 12, color: "#555" }}>Reading CMS specification for #${measureId}...</span>
              </div>
            </div>
          )}

          {error && <div style={{ background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: 8, padding: "10px 14px", color: "#ff4d4d", fontSize: 12 }}>⚠️ {error}</div>}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick suggestions strip */}
        {specLoaded && messages.length > 1 && (
          <div style={{ padding: "6px 20px", borderTop: "1px solid #1a1a2e", display: "flex", gap: 6, overflowX: "auto" }}>
            {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
              <button key={i} onClick={() => setQuestion(q)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: "1px solid #1e1e2e", background: "rgba(255,255,255,0.02)", color: "#555", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #1a1a2e", background: "#0a0a0f" }}>
          {!specLoaded ? (
            <div style={{ textAlign: "center", padding: 14, fontSize: 12, color: "#2a2a3a", border: "1px dashed #1a1a2e", borderRadius: 6 }}>
              ← Load a measure from CMS QPP first
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <textarea className="mi" value={question} rows={2}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(question); } }}
                placeholder={`Ask about MIPS #${measureId} (${year})... Enter to send, Shift+Enter for new line`}
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