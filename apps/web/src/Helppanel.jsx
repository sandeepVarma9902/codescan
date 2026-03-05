/**
 * HelpPanel.jsx — In-app contextual AI assistant
 * Sits inside each tab. Knows the context of the current tool/tab
 * and answers questions about how to use it.
 *
 * Props:
 *   tab      — "review" | "mips" | "devtools"
 *   tool     — (devtools only) active tool id e.g. "diff", "hipaa"
 *   isDark   — boolean
 */

import { useState, useRef, useEffect } from "react";

const SERVER = "https://codescan-server.onrender.com";

// ── Context knowledge per tab / tool ─────────────────────────────────────────
const CONTEXT = {
  review: `You are the CareCode in-app assistant for the Code Review tab.
CareCode is an AI code quality tool for healthcare engineers.

The Code Review tab lets users:
- Paste code (single file) or upload a project folder
- Select coding standards: SOLID, OWASP, Null Safety, Error Handling, DRY, Clean Code, Performance, HIPAA, Auth
- Add optional custom rules in plain English
- Click Analyze to get a score out of 100, a summary, strengths, and a list of issues with severity (Critical / Warning / Suggestion)
- Project mode reviews all files sequentially and shows an aggregate score, worst files, and all issues

The AI engine can be set to Auto (uses Groq free tier first), Cloud (Anthropic), or Local (Ollama).

Answer questions about how to use the Code Review tab, what standards mean, how scoring works, how to interpret results, and how to fix common issues. Be concise and helpful.`,

  mips: `You are the CareCode in-app assistant for the MIPS Expert tab.
CareCode is an AI tool for healthcare engineers.

The MIPS Expert tab lets users:
- Enter a MIPS measure ID (e.g. 001, 130, 236) and a year (2022–2026)
- Click Load Measure to fetch the official CMS PDF from qpp.cms.gov
- Chat with the measure using natural language
- Ask about denominator eligibility, ICD-10/CPT codes, numerator documentation, exclusions, year-over-year changes
- Compare two measures by saying "compare with measure 047"
- Load another measure mid-chat by saying "load measure 001"
- Use Quick Questions (💡) for common pre-filled queries
- PDFs are cached for the session — switching measures is fast after the first load

Common measure IDs: 001 (Diabetes HbA1c), 130 (Documentation of Care), 226 (Tobacco Use), 236 (Controlling HTN), 317 (Preventive Care).

Answer questions about how to use the MIPS Expert, what MIPS measures are, how to interpret results, and troubleshooting. Be concise and helpful.`,

  devtools: `You are the CareCode in-app assistant for the Dev Tools tab.
CareCode is an AI tool for healthcare engineers.

The Dev Tools tab has 13 specialised AI tools:

QUICK TOOLS:
- Git Diff: paste git diff output → line-by-line code review of changed lines only
- Explainer: paste any code → plain English explanation for a chosen audience level
- Refactor: paste code + choose language → cleaned-up version with changelog
- Test Generator: paste function/class + choose language/framework → 8-12 unit tests
- Doc Writer: paste undocumented code → JSDoc/docstrings + README snippet

MID-LEVEL:
- SQL Reviewer: paste SQL → security issues, performance problems, fixed version
- Secret Scanner: paste code/config → finds hardcoded credentials, fix plan
- Dep Auditor: paste package.json/requirements.txt → CVEs, outdated packages
- Regex Explainer: paste a regex pattern → breakdown, edge cases, test examples
- Architecture: paste multiple files (separated by // filename) → architectural analysis

EHR / COMPLIANCE:
- HIPAA Checker: paste backend code → PHI exposure, access control, audit gaps
- FHIR Validator: paste FHIR JSON/HL7 → spec violations, corrected resource
- API Contract: paste OpenAPI/Swagger → security issues, design problems, improvements

Each tool has a Load File button to upload files directly. Results can be copied with the Copy button.

Answer questions about how to use any of the Dev Tools, what each tool checks, tips for best results, and troubleshooting. Be concise and helpful.`,
};

// ── Suggested questions per tab ───────────────────────────────────────────────
const SUGGESTIONS = {
  review: [
    "How does the scoring work?",
    "What does OWASP check for?",
    "How do I review a whole project?",
    "What are custom rules?",
  ],
  mips: [
    "How do I load a measure?",
    "Can I compare two measures?",
    "What years are supported?",
    "What can I ask about a measure?",
  ],
  devtools: [
    "How do I use the Git Diff tool?",
    "What's the best way to use the HIPAA Checker?",
    "How do I paste multiple files for Architecture?",
    "Which tool should I use for finding secrets?",
  ],
};

const TOOL_LABELS = {
  diff:"Git Diff", explain:"Explainer", refactor:"Refactor", testgen:"Test Generator",
  docwrite:"Doc Writer", sql:"SQL Reviewer", secrets:"Secret Scanner", deps:"Dep Auditor",
  regex:"Regex Explainer", arch:"Architecture", hipaa:"HIPAA Checker", fhir:"FHIR Validator",
  apicon:"API Contract",
};

export default function HelpPanel({ tab = "review", tool = null, isDark = true }) {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef(null);
  const inputRef              = useRef(null);

  const T = {
    bg:       isDark ? "#0d0f1a" : "#ffffff",
    surface:  isDark ? "#111827" : "#f8fafc",
    border:   isDark ? "#1e2030" : "#e2e8f0",
    text:     isDark ? "#e2e8f0" : "#0f172a",
    textSub:  isDark ? "#9ca3af" : "#64748b",
    muted:    isDark ? "#374151" : "#94a3b8",
    inputBg:  isDark ? "#07080f" : "#f1f5f9",
    userBg:   "linear-gradient(135deg,#06b6d4,#6366f1)",
    botBg:    isDark ? "#1a1c2e" : "#f1f5f9",
    accent:   "#06b6d4",
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Build a system prompt that includes current tool context if in devtools
  const buildSystemPrompt = () => {
    let ctx = CONTEXT[tab] || CONTEXT.review;
    if (tab === "devtools" && tool && TOOL_LABELS[tool]) {
      ctx += `\n\nThe user currently has the "${TOOL_LABELS[tool]}" tool selected. Tailor your answers to that tool first if relevant.`;
    }
    return ctx;
  };

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");

    const userMsg = { role:"user", content: q };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);

    try {
      const res = await fetch(SERVER + "/api/review", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 600,
          messages: [
            { role:"user", content: buildSystemPrompt() + "\n\nUser question: " + q }
          ],
        }),
      });
      const data = await res.json();
      const reply = (data.content||[]).map(c=>c.text||"").join("") || data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response.";
      setMessages([...history, { role:"assistant", content: reply }]);
    } catch {
      setMessages([...history, { role:"assistant", content:"Server waking up — try again in 30s." }]);
    } finally {
      setLoading(false);
    }
  };

  const tabLabels = { review:"Code Review", mips:"MIPS Expert", devtools:"Dev Tools" };

  // ── Collapsed state — floating button ─────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:"fixed", bottom:24, right:24,
          width:52, height:52, borderRadius:"50%",
          background:"linear-gradient(135deg,#06b6d4,#6366f1)",
          border:"none", cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:22, boxShadow:"0 4px 24px rgba(6,182,212,0.4)",
          zIndex:200, transition:"transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform="scale(1.08)"; e.currentTarget.style.boxShadow="0 8px 32px rgba(6,182,212,0.5)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.boxShadow="0 4px 24px rgba(6,182,212,0.4)"; }}
        title={`Ask about ${tabLabels[tab]}`}
      >
        ❓
      </button>
    );
  }

  // ── Expanded state — chat panel ───────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes hp-slide-in { from { opacity:0; transform:translateY(16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        .hp-panel { animation: hp-slide-in 0.22s ease; }
        .hp-input { background:${T.inputBg}; border:1.5px solid ${T.border}; color:${T.text}; padding:10px 14px; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:13px; outline:none; width:100%; resize:none; line-height:1.5; transition:border-color 0.2s; }
        .hp-input:focus { border-color:#06b6d4; }
        .hp-chip { padding:7px 12px; border-radius:20px; border:1px solid ${T.border}; background:transparent; color:${T.textSub}; font-size:11px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; text-align:left; }
        .hp-chip:hover { border-color:rgba(6,182,212,0.4); color:#22d3ee; background:rgba(6,182,212,0.05); }
        .hp-send { width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg,#06b6d4,#6366f1); border:none; color:white; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:opacity 0.15s; }
        .hp-send:disabled { opacity:0.4; cursor:not-allowed; }
        .hp-spin { animation:hp-spin 1s linear infinite; display:inline-block; }
        @keyframes hp-spin { to { transform:rotate(360deg); } }
        ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:transparent; } ::-webkit-scrollbar-thumb { background:${T.border}; border-radius:4px; }
      `}</style>

      <div className="hp-panel" style={{
        position:"fixed", bottom:24, right:24,
        width:360, maxHeight:520,
        background:T.bg, border:"1px solid " + T.border,
        borderRadius:16, boxShadow:"0 16px 48px rgba(0,0,0,0.4)",
        display:"flex", flexDirection:"column", overflow:"hidden",
        zIndex:200, fontFamily:"'DM Sans',sans-serif",
      }}>

        {/* Header */}
        <div style={{ padding:"14px 16px", borderBottom:"1px solid " + T.border, display:"flex", alignItems:"center", gap:10, background:T.surface, flexShrink:0 }}>
          <div style={{ width:30, height:30, borderRadius:9, background:"linear-gradient(135deg,#06b6d4,#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>
            ❓
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.text, fontFamily:"'Bricolage Grotesque',sans-serif" }}>
              Help — {tabLabels[tab]}
              {tab === "devtools" && tool && TOOL_LABELS[tool] && (
                <span style={{ fontSize:10, color:T.accent, marginLeft:6, fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>· {TOOL_LABELS[tool]}</span>
              )}
            </div>
            <div style={{ fontSize:10, color:T.muted }}>Ask anything about this tab</div>
          </div>
          <button onClick={() => setOpen(false)} style={{ background:"none", border:"none", color:T.muted, cursor:"pointer", fontSize:18, lineHeight:1, padding:4 }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:14, display:"flex", flexDirection:"column", gap:10 }}>

          {/* Welcome + suggestions */}
          {messages.length === 0 && (
            <>
              <div style={{ background:T.botBg, borderRadius:"4px 14px 14px 14px", padding:"10px 14px", fontSize:13, color:T.textSub, lineHeight:1.6 }}>
                👋 Hi! Ask me anything about how to use <strong style={{ color:T.text }}>{tabLabels[tab]}</strong>
                {tab === "devtools" && tool && TOOL_LABELS[tool] && <> or the <strong style={{ color:T.accent }}>{TOOL_LABELS[tool]}</strong> tool</>}.
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:4 }}>
                {(SUGGESTIONS[tab] || []).map((s, i) => (
                  <button key={i} className="hp-chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </>
          )}

          {/* Chat history */}
          {messages.map((m, i) => (
            <div key={i} style={{ display:"flex", flexDirection: m.role==="user" ? "row-reverse" : "row", gap:8, alignItems:"flex-end" }}>
              {m.role === "assistant" && (
                <div style={{ width:22, height:22, borderRadius:6, background:"rgba(6,182,212,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, flexShrink:0 }}>⚡</div>
              )}
              <div style={{
                maxWidth:"82%",
                background: m.role==="user" ? T.userBg : T.botBg,
                borderRadius: m.role==="user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                padding:"9px 13px",
                fontSize:13, color: m.role==="user" ? "#fff" : T.textSub,
                lineHeight:1.65,
                whiteSpace:"pre-wrap",
                wordBreak:"break-word",
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {/* Loading dots */}
          {loading && (
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              <div style={{ width:22, height:22, borderRadius:6, background:"rgba(6,182,212,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11 }}>⚡</div>
              <div style={{ background:T.botBg, borderRadius:"4px 14px 14px 14px", padding:"10px 14px", display:"flex", gap:5, alignItems:"center" }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:T.muted, animation:`hp-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />
                ))}
                <style>{`@keyframes hp-dot { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }`}</style>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{ padding:"10px 12px", borderTop:"1px solid " + T.border, background:T.surface, display:"flex", gap:8, alignItems:"flex-end", flexShrink:0 }}>
          <textarea
            ref={inputRef}
            className="hp-input"
            rows={1}
            placeholder="Ask a question..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            onInput={e => { e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight, 90)+"px"; }}
            style={{ minHeight:36, maxHeight:90 }}
          />
          <button className="hp-send" onClick={() => send()} disabled={loading || !input.trim()}>
            {loading ? <span className="hp-spin">⚡</span> : "→"}
          </button>
        </div>
      </div>
    </>
  );
}