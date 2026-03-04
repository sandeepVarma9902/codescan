/**
 * MipsChat.jsx — MIPS Expert chat, mobile-first
 * Fixes:
 *  - Full light/dark theme support via isDark prop
 *  - Cross-measure loading: "load measure 001" fetches that PDF
 *  - Cross-measure compare: "compare with 047" fetches measure 047 PDF
 *  - Streaming SSE with blinking cursor
 *  - Client-side PDF session cache
 */

import React, { useState, useRef, useEffect } from "react";

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

const COMMON_MEASURES = [
  ["001","Diabetes HbA1c"],
  ["130","Documentation"],
  ["226","Tobacco"],
  ["236","Control HTN"],
  ["317","Prev Care"],
];

export default function MipsChat({ isDark = true }) {
  // ── Theme tokens ──────────────────────────────────────────────────────────
  const T = {
    bg:          isDark ? "#07080f"  : "#f1f5f9",
    surface:     isDark ? "#0d0f1a"  : "#ffffff",
    surfaceAlt:  isDark ? "#111827"  : "#f8fafc",
    border:      isDark ? "#1e2030"  : "#e2e8f0",
    borderSub:   isDark ? "#1a1c2e"  : "#e8edf2",
    text:        isDark ? "#e2e8f0"  : "#0f172a",
    textSub:     isDark ? "#9ca3af"  : "#64748b",
    textMuted:   isDark ? "#374151"  : "#94a3b8",
    msgUser:     "linear-gradient(135deg,#06b6d4,#6366f1)",
    msgBot:      isDark ? "#111827"  : "#ffffff",
    msgBotBorder:isDark ? "#1e2030"  : "#e2e8f0",
    systemMsg:   isDark ? "rgba(74,222,128,0.06)"   : "rgba(34,197,94,0.06)",
    systemBorder:isDark ? "rgba(74,222,128,0.18)"   : "rgba(34,197,94,0.25)",
    inputBg:     isDark ? "#0d0f1a"  : "#f8fafc",
    chipBg:      isDark ? "rgba(255,255,255,0.02)" : "#f1f5f9",
    timestamp:   isDark ? "#1f2937"  : "#cbd5e1",
    errorBg:     isDark ? "rgba(248,113,113,0.08)" : "rgba(254,202,202,0.4)",
    errorBorder: isDark ? "rgba(248,113,113,0.2)"  : "rgba(248,113,113,0.4)",
  };

  const [measureId, setMeasureId]             = useState("");
  const [year, setYear]                       = useState("2025");
  const [draftId, setDraftId]                 = useState("");
  const [draftYear, setDraftYear]             = useState("2025");
  const [question, setQuestion]               = useState("");
  const [messages, setMessages]               = useState([]);
  const [streamingText, setStreamingText]     = useState("");
  const [loading, setLoading]                 = useState(false);
  const [loadingSpec, setLoadingSpec]         = useState(false);
  const [pdfData, setPdfData]                 = useState(null);
  const [specLoaded, setSpecLoaded]           = useState(false);
  const [specError, setSpecError]             = useState(null);
  const [error, setError]                     = useState(null);
  const [showSelector, setShowSelector]       = useState(true);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showQuickQ, setShowQuickQ]           = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const pdfCacheRef    = useRef({});  // session cache: "year_id" -> pdfData

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamingText]);

  // ── Session-cached PDF fetch ───────────────────────────────────────────────
  const fetchPdfCached = async (id, yr) => {
    const paddedId = String(id).padStart(3, "0");
    const key = yr + "_" + paddedId;
    if (pdfCacheRef.current[key]) return pdfCacheRef.current[key];
    const res = await fetch(SERVER + "/api/cms/measure/" + yr + "/" + paddedId);
    if (!res.ok) return null;
    const data = await res.json();
    pdfCacheRef.current[key] = data;
    return data;
  };

  // ── Load / switch measure ─────────────────────────────────────────────────
  const loadSpec = async (id, yr, silent = false) => {
    const targetId   = String(id || draftId).padStart(3, "0");
    const targetYear = yr || draftYear;
    if (!targetId || targetId === "000") return;

    setLoadingSpec(true);
    setSpecError(null);
    setPdfData(null);
    setSpecLoaded(false);
    setShowChangeModal(false);

    if (!silent && specLoaded) {
      setMessages(prev => [...prev, {
        role: "system",
        displayContent: "Switching to MIPS #" + targetId + " (" + targetYear + ")...",
        timestamp: new Date().toLocaleTimeString(),
      }]);
    }

    try {
      const data = await fetchPdfCached(targetId, targetYear);
      if (!data) throw new Error("Measure #" + targetId + " not found for " + targetYear + ".");

      setPdfData(data);
      setMeasureId(targetId);
      setYear(targetYear);
      setSpecLoaded(true);
      setShowSelector(false);

      const title   = (data.sections && data.sections.measureTitle) || ("MIPS Measure #" + targetId);
      const hasData = data.pageCount > 0 && data.charCount > 500;

      if (!silent) {
        setMessages(prev => [...prev, {
          role: "assistant",
          displayContent: hasData
            ? "OK! Loaded **MIPS #" + targetId + " (" + targetYear + ")**\n\n**" + title + "**\n\n"
              + data.pageCount + " pages · " + (data.charCount/1000).toFixed(1) + "K chars"
              + (data.cached ? " · cached" : "")
              + "\n\nAsk me anything about this measure."
            : "Loaded **MIPS #" + targetId + "** but got limited data. I'll answer from training knowledge.",
          timestamp: new Date().toLocaleTimeString(),
          isSystem: true,
        }]);
      }
    } catch (e) {
      setSpecError(
        e.message.includes("fetch")     ? "Server waking up — wait 30s and try again." :
        e.message.includes("not found") ? "Measure #" + targetId + " not found for " + targetYear + "." :
        e.message
      );
      setShowSelector(true);
    } finally {
      setLoadingSpec(false);
    }
  };

  // ── Detect other measure IDs mentioned in a query ──────────────────────────
  // Returns array of padded IDs that differ from current measureId
  const detectOtherMeasureIds = (q) => {
    const found = new Set();
    // "#047", "#47", "measure 047", "measure 47", "MIPS 047", "measure #47"
    const patterns = [
      /(?:measure|mips)\s*#?(\d{1,3})\b/gi,
      /#(\d{1,3})\b/g,
    ];
    patterns.forEach(re => {
      let m;
      while ((m = re.exec(q)) !== null) {
        const padded = String(m[1]).padStart(3, "0");
        if (padded !== measureId && padded !== "000") found.add(padded);
      }
    });
    return Array.from(found);
  };

  // ── Detect "load/switch to measure X" intent ──────────────────────────────
  const detectLoadIntent = (q) => {
    const m = q.match(/\b(?:load|switch\s+to|open|show|get|use)\s+(?:measure\s*#?|mips\s*#?)?(\d{1,3})\b/i);
    if (m) return String(m[1]).padStart(3, "0");
    return null;
  };

  // ── Build year-annotated context block for a PDF ──────────────────────────
  const buildContext = (id, yr, data) => {
    const s = (data && data.sections) || {};
    return "=== MIPS #" + id + " (" + yr + ")" + (data.cached ? " [cached]" : "") + " ===\n"
      + "Source: " + data.pdfUrl + "\n"
      + "TITLE: "            + (s.measureTitle      || "") + "\n"
      + "TYPE: "             + (s.measureType        || "") + "\n"
      + "DESCRIPTION: "      + (s.description        || "") + "\n"
      + "SUBMISSION: "       + (s.submissionMethods  || "") + "\n"
      + "DENOMINATOR: "      + (s.denominator        || "") + "\n"
      + "DENOMINATOR NOTE: " + (s.denominatorNote    || "") + "\n"
      + "NUMERATOR: "        + (s.numerator          || "") + "\n"
      + "EXCLUSIONS: "       + (s.exclusions         || "") + "\n"
      + "EXCEPTIONS: "       + (s.exceptions         || "") + "\n"
      + "--- FULL TEXT ---\n" + (data.fullText || "");
  };

  // ── Clarification state for "other" free-text input ─────────────────────
  const [clarifyOther, setClarifyOther] = useState({});

  // ── Post a clarification card (no API call) ───────────────────────────────
  const askClarification = (userQ, card) => {
    setMessages(prev => [
      ...prev,
      { role: "user",          displayContent: userQ, timestamp: new Date().toLocaleTimeString() },
      { role: "clarification", card,                  timestamp: new Date().toLocaleTimeString() },
    ]);
    setQuestion("");
  };

  // ── Detect ambiguity → return a card or null ──────────────────────────────
  const checkAmbiguity = (q) => {
    const curYr = parseInt(year);

    const wantsOtherMeasure = /compare\s+(with|to|against)|load\s+(?:another|different|other)|switch\s+measure|other\s+measure/i.test(q);
    const hasExplicitId     = /\b\d{1,3}\b/.test(q);
    if (wantsOtherMeasure && !hasExplicitId) {
      return {
        question: "Which measure would you like to compare with?",
        options: COMMON_MEASURES.map(([id, label]) => ({
          label: "#" + id + " — " + label,
          value: "Compare current measure with measure " + id,
        })),
      };
    }

    const wantsYearCompare = /compare|what.?changed|difference|evolution|last year|previous year/i.test(q);
    const hasYearInfo      = /\b202\d\b|last\s+\d+\s+year|all years|every year/i.test(q);
    if (wantsYearCompare && !hasYearInfo && !/measure|mips|#\d/i.test(q)) {
      return {
        question: "Which year(s) would you like to compare?",
        options: [
          { label: "vs " + (curYr-1) + " (last year)",              value: "What changed from " + (curYr-1) + " to " + curYr + "?" },
          { label: "Last 2 years (" + (curYr-1) + "–" + curYr + ")", value: "Compare last 2 years" },
          { label: "Last 3 years (" + (curYr-2) + "–" + curYr + ")", value: "Compare last 3 years" },
          { label: "All available years",                             value: "Compare all years" },
        ],
      };
    }

    if (/^compare\.?$/i.test(q.trim())) {
      return {
        question: "What would you like to compare?",
        options: [
          { label: "📅 A different year",          value: "What changed from " + (curYr-1) + " to " + curYr + "?" },
          { label: "📋 A different measure",        value: "Compare with another measure" },
          { label: "📊 Numerator vs Denominator",  value: "Compare the numerator and denominator criteria for this measure" },
        ],
      };
    }

    if (/^(what|which)\s+year/i.test(q.trim())) {
      return {
        question: "I have MIPS #" + measureId + " (" + year + ") loaded. Switch to a different year?",
        options: YEARS.filter(y => y !== year).map(y => ({
          label: y,
          value: "Load year " + y + " for measure " + measureId,
        })),
      };
    }

    if (/^(what|which)\s+(measure|mips)/i.test(q.trim())) {
      return {
        question: "I have MIPS #" + measureId + " (" + year + ") loaded. Switch to a different measure?",
        options: COMMON_MEASURES.map(([id, label]) => ({
          label: "#" + id + " — " + label,
          value: "Load measure " + id,
        })),
      };
    }

    return null;
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (q) => {
    if (!q.trim() || !specLoaded || !pdfData) return;
    setError(null);
    setShowQuickQ(false);

    // ── Clarification check — ask rather than guess ─────────────────────
    const clarification = checkAmbiguity(q);
    if (clarification) {
      askClarification(q, clarification);
      return;
    }

    const userMsg = { role: "user", displayContent: q, timestamp: new Date().toLocaleTimeString() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setQuestion("");
    setLoading(true);
    setStreamingText("");

    try {
      // ── 1. Check for explicit "load measure X" command ──────────────────
      const loadId = detectLoadIntent(q);
      if (loadId && loadId !== measureId) {
        // Actually switch to the requested measure
        setMessages(prev => [...prev, {
          role: "system",
          displayContent: "Loading MIPS #" + loadId + "...",
          timestamp: new Date().toLocaleTimeString(),
        }]);
        setLoading(false);
        await loadSpec(loadId, year, false);
        // loadSpec already adds a confirmation message
        setMessages(prev => prev.filter(m => !m.displayContent?.startsWith("Loading MIPS #")));
        return;
      }

      // ── 2. Detect other measure IDs for cross-measure comparison ────────
      const otherIds = detectOtherMeasureIds(q);

      // ── 3. Detect year comparison ────────────────────────────────────────
      const isYearCompare = /compare|diff|changed|added|removed|vs\b|evolution|trend|across.?year/i.test(q)
        && (/last\s+\d+\s+years?|all years|every year|\b202\d\b/i.test(q));

      const yearsToFetch = new Set();
      if (isYearCompare) {
        const explicitYears = Array.from(q.matchAll(/\b(202\d)\b/g)).map(m => m[1]);
        explicitYears.forEach(y => yearsToFetch.add(y));
        const lastNMatch = q.match(/(?:last|past)\s+(two|three|four|five|\d+)\s+years?/i);
        if (lastNMatch) {
          const wm = { two:2, three:3, four:4, five:5 };
          const n = parseInt(lastNMatch[1]) || wm[lastNMatch[1].toLowerCase()] || 2;
          for (let i = 0; i < n; i++) yearsToFetch.add(String(parseInt(year) - i));
        }
        if (/all years|every year/i.test(q)) {
          for (let i = 0; i < 4; i++) yearsToFetch.add(String(parseInt(year) - i));
        }
        yearsToFetch.add(year);
      }

      // ── 4. Build the context object(s) to send to AI ────────────────────
      let allContexts = "";
      const contextSummary = [];

      if (otherIds.length > 0) {
        // Cross-measure mode: fetch the other measures + current
        const allIds = [measureId, ...otherIds];
        setMessages(prev => [...prev, {
          role: "system",
          displayContent: "Fetching MIPS #" + allIds.join(", #") + " specs...",
          timestamp: new Date().toLocaleTimeString(),
        }]);

        const results = await Promise.allSettled(
          allIds.map(id => fetchPdfCached(id, year))
        );

        setMessages(prev => prev.filter(m => !m.displayContent?.startsWith("Fetching MIPS #")));

        allIds.forEach((id, i) => {
          const r = results[i];
          if (r.status === "fulfilled" && r.value) {
            allContexts += buildContext(id, year, r.value) + "\n\n";
            contextSummary.push("MIPS #" + id);
          } else {
            allContexts += "=== MIPS #" + id + " (" + year + ") — NOT FOUND ===\n\n";
            contextSummary.push("MIPS #" + id + " (unavailable)");
          }
        });

      } else if (isYearCompare && yearsToFetch.size > 1) {
        // Multi-year same-measure mode
        const sortedYears = Array.from(yearsToFetch).sort();
        setMessages(prev => [...prev, {
          role: "system",
          displayContent: "Loading " + sortedYears.join(", ") + " specs in parallel...",
          timestamp: new Date().toLocaleTimeString(),
        }]);

        const results = await Promise.allSettled(
          sortedYears.map(yr => fetchPdfCached(measureId, yr))
        );

        setMessages(prev => prev.filter(m => m.displayContent?.startsWith("Loading ") === false));

        sortedYears.forEach((yr, i) => {
          const r = results[i];
          if (r.status === "fulfilled" && r.value) {
            allContexts += buildContext(measureId, yr, r.value) + "\n\n";
            contextSummary.push(yr);
          }
        });

      } else {
        // Single measure, current year
        allContexts = buildContext(measureId, year, pdfData);
        contextSummary.push("MIPS #" + measureId + " (" + year + ")");
      }

      const isCrossMeasure = otherIds.length > 0;
      const isMultiYear    = isYearCompare && yearsToFetch.size > 1;
      const isComparison   = isCrossMeasure || isMultiYear;

      // ── 5. Build system prompt ───────────────────────────────────────────
      let systemContent;
      if (isCrossMeasure) {
        systemContent = "You are a MIPS expert for a US EHR application.\n\n"
          + "You have the official CMS PDFs for: " + contextSummary.join(", ") + "\n\n"
          + allContexts
          + "Compare these measures in detail. For each section (denominator, numerator, exclusions, CPT codes, ICD-10 codes), "
          + "show what is the same, what differs, and which measure is stricter or broader. "
          + "Quote exact codes. Be specific and exhaustive.";
      } else if (isMultiYear) {
        const sortedYears = Array.from(yearsToFetch).sort();
        systemContent = "You are a MIPS expert for a US EHR application.\n\n"
          + "You have MIPS #" + measureId + " across years: " + sortedYears.join(", ") + "\n\n"
          + allContexts
          + "Do a detailed year-over-year comparison:\n"
          + "## Overview (" + sortedYears.join(" -> ") + ")\n"
          + "Then for each year transition:\n"
          + "### Added codes | ### Removed codes | ### Changed criteria | ### Unchanged\n"
          + "Be exhaustive. Quote exact codes.";
      } else {
        systemContent = "You are a MIPS expert for a US EHR application (HIPAA compliant).\n\n"
          + "Official CMS spec for MIPS #" + measureId + " (" + year + "):\n\n"
          + allContexts + "\n\n"
          + "Answer from the PDF only. Quote exact codes. State YES/NO/MAYBE for eligibility. "
          + "Keep answers concise. If not in PDF, say so clearly.";
      }

      const msgs = [
        { role: "user",      content: systemContent },
        { role: "assistant", content: "Understood. I have " + contextSummary.join(", ") + ". Ready." },
        ...updated
          .filter(m => m.role !== "system" && m.role !== "clarification")
          .slice(1)
          .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.displayContent || "" })).filter(m => m.content),
      ];

      // ── 6. Call API with streaming ───────────────────────────────────────
      const res = await fetch(SERVER + "/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model:      "llama-3.3-70b-versatile",
          max_tokens: isComparison ? 3000 : 1200,
          stream:     true,
          messages:   msgs,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson.error && errJson.error.message) || "Error " + res.status);
      }

      const ct = res.headers.get("content-type") || "";

      if (ct.includes("text/event-stream")) {
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "", fullText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") break;
            try {
              const token = JSON.parse(raw).token || "";
              if (token) { fullText += token; setStreamingText(fullText); }
            } catch (_) {}
          }
        }
        setStreamingText("");
        setMessages(prev => [
          ...prev.filter(m => m.role !== "system" && m.role !== "clarification"),
          { role: "assistant", displayContent: fullText, timestamp: new Date().toLocaleTimeString() },
        ]);
      } else {
        const data = await res.json();
        const text = (data.content || []).map(c => c.text || "").join("");
        setMessages(prev => [
          ...prev.filter(m => m.role !== "system" && m.role !== "clarification"),
          { role: "assistant", displayContent: text, timestamp: new Date().toLocaleTimeString() },
        ]);
      }

    } catch (e) {
      setStreamingText("");
      setError(e.message.includes("fetch") ? "Server waking up — try again in 30s." : e.message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  // ── Markdown formatter ────────────────────────────────────────────────────
  const fmt = (text) => text.split("\n").map((line, i) => {
    if (!line.trim()) return React.createElement("div", { key: i, style: { height: 5 } });
    if (line.startsWith("## "))
      return React.createElement("div", { key: i, style: { fontSize:14, fontWeight:700, color: T.text, marginTop:14, marginBottom:4, fontFamily:"'Bricolage Grotesque',sans-serif" } }, line.slice(3));
    if (line.startsWith("### "))
      return React.createElement("div", { key: i, style: { fontSize:13, fontWeight:700, color: isDark ? "#94a3b8" : "#475569", marginTop:10, marginBottom:3, fontFamily:"'Bricolage Grotesque',sans-serif" } }, line.slice(4));
    if (line.startsWith("**") && line.endsWith("**"))
      return React.createElement("div", { key: i, style: { fontWeight:700, color: T.text, marginTop:6, fontSize:13 } }, line.replace(/\*\*/g,""));
    if (line.startsWith("- ") || line.startsWith("\u2022 "))
      return React.createElement("div", { key: i, style: { paddingLeft:12, marginBottom:3, color: isDark ? "#c9d1d9" : "#334155", fontSize:13, lineHeight:1.6 } }, "\u00b7 " + line.slice(2));
    const html = line
      .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:' + T.text + ';font-weight:700">$1</strong>')
      .replace(/\b([A-Z]\d{2}\.?\d*[A-Z0-9]*)\b/g, '<code style="background:rgba(6,182,212,0.12);color:#22d3ee;padding:1px 5px;border-radius:4px;font-size:11px;font-family:DM Mono,monospace">$1</code>')
      .replace(/\b(\d{5})\b/g, '<code style="background:rgba(99,102,241,0.12);color:#818cf8;padding:1px 5px;border-radius:4px;font-size:11px;font-family:DM Mono,monospace">$1</code>');
    return React.createElement("div", { key: i, style: { color: T.textSub, fontSize:13, lineHeight:1.75, marginBottom:2 }, dangerouslySetInnerHTML: { __html: html } });
  });

  // ── CSS classes — theme-aware ─────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono&family=Bricolage+Grotesque:wght@700;800&display=swap');
    .mi {
      background:${T.inputBg}; border:1.5px solid ${T.border}; color:${T.text};
      padding:12px 14px; border-radius:10px; font-family:'DM Sans',sans-serif;
      font-size:15px; outline:none; width:100%; transition:border-color 0.2s;
    }
    .mi:focus { border-color:rgba(6,182,212,0.5); }
    .load-btn {
      background:linear-gradient(135deg,#06b6d4,#6366f1); border:none; color:white;
      padding:16px; border-radius:12px; cursor:pointer;
      font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:16px;
      width:100%; transition:all 0.2s; min-height:54px;
    }
    .load-btn:disabled { opacity:0.4; cursor:not-allowed; }
    .send-btn {
      background:linear-gradient(135deg,#06b6d4,#6366f1); border:none; color:white;
      width:48px; height:48px; border-radius:12px; cursor:pointer; font-size:20px;
      display:flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .send-btn:disabled { opacity:0.4; cursor:not-allowed; }
    .quick-chip {
      padding:10px 16px; border-radius:20px; border:1.5px solid ${T.border};
      background:${T.chipBg}; color:${T.textMuted}; font-size:13px; cursor:pointer;
      transition:all 0.15s; white-space:nowrap; font-family:'DM Sans',sans-serif;
    }
    .quick-chip:hover { border-color:rgba(6,182,212,0.4); color:#22d3ee; }
    .mips-select option { background:${T.surface}; color:${T.text}; }
    .spin { animation:spin 1s linear infinite; display:inline-block; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .fade { animation:fi 0.3s ease-out; }
    @keyframes fi { from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;} }
    .typing-dot { width:7px; height:7px; border-radius:50%; background:${T.textMuted}; animation:bounce 1.2s infinite; }
    .typing-dot:nth-child(2){animation-delay:0.2s;}
    .typing-dot:nth-child(3){animation-delay:0.4s;}
    @keyframes bounce { 0%,60%,100%{transform:translateY(0);} 30%{transform:translateY(-6px);} }
    .overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:200; display:flex; align-items:flex-end; }
    .mips-modal { background:${T.surface}; border:1.5px solid ${T.border}; border-radius:20px 20px 0 0; padding:24px; width:100%; }
    .cursor-blink { display:inline-block; width:2px; height:13px; background:#22d3ee; margin-left:2px; animation:blink 1s step-end infinite; vertical-align:middle; }
    @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0;} }
  `;

  // ── Shared measure picker form ────────────────────────────────────────────
  const MeasureForm = ({ inModal }) => (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div>
        <div style={{ fontSize:11, color:T.textMuted, textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:8, fontWeight:600 }}>Measure ID</div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ color:"#22d3ee", fontSize: inModal?20:22, fontWeight:800, fontFamily:"'Bricolage Grotesque',sans-serif" }}>#</span>
          <input className="mi" value={draftId} placeholder="e.g. 236"
            onChange={e => setDraftId(e.target.value.replace(/\D/g,""))}
            onKeyDown={e => e.key==="Enter" && loadSpec(draftId, draftYear)}
            style={{ fontSize: inModal?18:20, fontWeight:700 }} autoFocus={!inModal} />
        </div>
      </div>
      <div>
        <div style={{ fontSize:11, color:T.textMuted, textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:8, fontWeight:600 }}>Performance Year</div>
        <select className="mi mips-select" value={draftYear} onChange={e => setDraftYear(e.target.value)} style={{ fontSize:16 }}>
          {YEARS.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>
      {specError && (
        <div style={{ background:T.errorBg, border:"1.5px solid " + T.errorBorder, borderRadius:12, padding:"12px 16px", color:"#f87171", fontSize:13 }}>
          ⚠️ {specError}
        </div>
      )}
      <button className="load-btn" onClick={() => loadSpec(draftId, draftYear)} disabled={!draftId.trim() || loadingSpec}>
        {loadingSpec ? <><span className="spin">⚡</span> Downloading CMS PDF...</> : "📄 Load Measure Spec"}
      </button>
      <div style={{ marginTop:8 }}>
        <div style={{ fontSize:11, color:T.textMuted, marginBottom:10, textTransform:"uppercase", letterSpacing:"1px" }}>Common Measures</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {COMMON_MEASURES.map(([id, label]) => (
            <button key={id} onClick={() => setDraftId(id)} style={{
              padding:"8px 14px", borderRadius:20, border:"1.5px solid " + T.border,
              background: draftId===id ? "rgba(6,182,212,0.12)" : T.chipBg,
              color: draftId===id ? "#22d3ee" : T.textMuted,
              fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s"
            }}>
              #{id} {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 65px)", background:T.bg, fontFamily:"'DM Sans',sans-serif", position:"relative" }}>
      <style>{css}</style>

      {/* ── SETUP SCREEN ── */}
      {showSelector ? (
        <div style={{ flex:1, overflowY:"auto", padding:"24px 20px 100px" }}>
          <div style={{ maxWidth:480, margin:"0 auto" }}>
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <div style={{ fontSize:52, marginBottom:12 }}>🏥</div>
              <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:24, fontWeight:800, color:T.text, marginBottom:8 }}>MIPS Expert</div>
              <div style={{ fontSize:14, color:T.textSub, lineHeight:1.7 }}>
                Enter a measure ID and year to load the official CMS specification. I'll read the full PDF and answer your questions from the actual document.
              </div>
            </div>
            <MeasureForm inModal={false} />
            <div style={{ marginTop:16, background: isDark?"rgba(6,182,212,0.04)":"rgba(6,182,212,0.06)", border:"1px solid " + (isDark?"rgba(6,182,212,0.12)":"rgba(6,182,212,0.2)"), borderRadius:10, padding:"10px 14px", fontSize:12, color:T.textSub, lineHeight:1.7 }}>
              💡 <strong style={{ color:T.text }}>Tips:</strong> Once loaded you can say —<br />
              <em>"Compare last 3 years"</em> · <em>"Compare with measure 047"</em> · <em>"Load measure 001"</em>
            </div>
          </div>
        </div>

      ) : (
        <>
          {/* ── Compact measure bar ── */}
          <div style={{ padding:"12px 16px", borderBottom:"1px solid " + T.borderSub, background:T.surface, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#06b6d4,#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🏥</div>
              <div>
                <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:14, fontWeight:800, color:T.text }}>
                  MIPS #{measureId}
                </div>
                <div style={{ fontSize:11, color:T.textMuted }}>
                  {year} · {pdfData?.pageCount}p · {(pdfData?.charCount/1000).toFixed(1)}K chars
                  {pdfData?.cached && " · 📦 cached"}
                  {" · 🗃️ " + Object.keys(pdfCacheRef.current).length + " in session"}
                </div>
              </div>
            </div>
            <button onClick={() => { setShowChangeModal(true); setDraftId(measureId); setDraftYear(year); }}
              style={{ padding:"8px 14px", borderRadius:8, border:"1.5px solid " + T.border, background:"transparent", color:T.textMuted, fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
              Change ↗
            </button>
          </div>

          {/* ── Messages ── */}
          <div style={{ flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:12, paddingBottom:8 }}>
            {messages.map((msg, i) => {
              // ── System notice ──────────────────────────────────────────────
              if (msg.role === "system") return (
                <div key={i} style={{ textAlign:"center", fontSize:11, color:T.textMuted, padding:"4px 0" }}>— {msg.displayContent} —</div>
              );

              // ── Clarification card with clickable options ──────────────────
              if (msg.role === "clarification") {
                const card = msg.card;
                const otherVal = clarifyOther[i] || "";
                return (
                  <div key={i} className="fade" style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:"rgba(6,182,212,0.12)", border:"1px solid rgba(6,182,212,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, marginTop:4 }}>🏥</div>
                    <div style={{ maxWidth:"88%", background:T.msgBot, border:"1px solid " + T.msgBotBorder, borderRadius:"4px 18px 18px 18px", padding:"14px 16px", boxShadow: isDark?"none":"0 1px 4px rgba(0,0,0,0.06)" }}>
                      <div style={{ fontSize:13, color:T.text, fontWeight:600, marginBottom:12, lineHeight:1.5 }}>{card.question}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {card.options.map((opt, oi) => (
                          <button key={oi} onClick={() => sendMessage(opt.value)} style={{
                            display:"flex", alignItems:"center", gap:10,
                            padding:"10px 14px", borderRadius:10,
                            border:"1.5px solid " + T.border,
                            background:T.chipBg, cursor:"pointer",
                            fontFamily:"'DM Sans',sans-serif", fontSize:13, color:T.text,
                            textAlign:"left", transition:"all 0.15s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor="#06b6d4"; e.currentTarget.style.background="rgba(6,182,212,0.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.chipBg; }}>
                            <span style={{ width:16, height:16, borderRadius:"50%", border:"2px solid #06b6d4", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <span style={{ width:7, height:7, borderRadius:"50%", background:"transparent" }} />
                            </span>
                            {opt.label}
                          </button>
                        ))}

                        {/* Other — free text */}
                        <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:2 }}>
                          <span style={{ width:16, height:16, borderRadius:"50%", border:"2px solid " + T.textMuted, flexShrink:0 }} />
                          <input
                            className="mi"
                            placeholder="Other — type your own..."
                            value={otherVal}
                            onChange={e => setClarifyOther(prev => ({ ...prev, [i]: e.target.value }))}
                            onKeyDown={e => { if (e.key==="Enter" && otherVal.trim()) { sendMessage(otherVal.trim()); setClarifyOther(prev => ({ ...prev, [i]: "" })); } }}
                            style={{ fontSize:13, padding:"9px 12px", flex:1 }}
                          />
                          {otherVal.trim() && (
                            <button className="send-btn" style={{ width:36, height:36, fontSize:14 }}
                              onClick={() => { sendMessage(otherVal.trim()); setClarifyOther(prev => ({ ...prev, [i]: "" })); }}>
                              →
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize:9, color:T.timestamp, marginTop:10 }}>{msg.timestamp}</div>
                    </div>
                  </div>
                );
              }

              // ── Normal user / assistant message ───────────────────────────
              return (
                <div key={i} className="fade" style={{ display:"flex", flexDirection:msg.role==="user"?"row-reverse":"row", gap:8, alignItems:"flex-end" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width:28, height:28, borderRadius:8, background:"rgba(6,182,212,0.12)", border:"1px solid rgba(6,182,212,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, marginBottom:4 }}>🏥</div>
                  )}
                  <div style={{
                    maxWidth:"82%",
                    background:   msg.role==="user" ? T.msgUser : msg.isSystem ? T.systemMsg : T.msgBot,
                    border:       msg.role!=="user" ? ("1px solid " + (msg.isSystem ? T.systemBorder : T.msgBotBorder)) : "none",
                    borderRadius: msg.role==="user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                    padding:"12px 16px",
                    boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
                  }}>
                    {msg.role==="user"
                      ? <div style={{ color:"white", fontSize:14, lineHeight:1.6 }}>{msg.displayContent}</div>
                      : <div>{fmt(msg.displayContent)}</div>}
                    <div style={{ fontSize:9, color:msg.role==="user"?"rgba(255,255,255,0.4)":T.timestamp, marginTop:6, textAlign:msg.role==="user"?"right":"left" }}>
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Streaming bubble */}
            {streamingText && (
              <div className="fade" style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                <div style={{ width:28, height:28, borderRadius:8, background:"rgba(6,182,212,0.12)", border:"1px solid rgba(6,182,212,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>🏥</div>
                <div style={{ maxWidth:"82%", background:T.msgBot, border:"1px solid " + T.msgBotBorder, borderRadius:"4px 18px 18px 18px", padding:"12px 16px", boxShadow: isDark?"none":"0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div>{fmt(streamingText)}</div>
                  <span className="cursor-blink" />
                </div>
              </div>
            )}

            {/* Typing dots */}
            {loading && !streamingText && (
              <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                <div style={{ width:28, height:28, borderRadius:8, background:"rgba(6,182,212,0.12)", border:"1px solid rgba(6,182,212,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>🏥</div>
                <div style={{ background:T.msgBot, border:"1px solid " + T.msgBotBorder, borderRadius:"4px 18px 18px 18px", padding:"14px 18px", display:"flex", gap:6, alignItems:"center" }}>
                  <div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/>
                </div>
              </div>
            )}

            {error && (
              <div style={{ background:T.errorBg, border:"1px solid " + T.errorBorder, borderRadius:12, padding:"10px 14px", color:"#f87171", fontSize:13 }}>⚠️ {error}</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick questions */}
          {showQuickQ && (
            <div style={{ padding:"8px 16px", borderTop:"1px solid " + T.borderSub, overflowX:"auto", display:"flex", gap:8, background:T.surface }}>
              {QUICK_QUESTIONS.map((q,i) => (
                <button key={i} className="quick-chip" onClick={() => sendMessage(q)}>{q}</button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div style={{ padding:"12px 16px", borderTop:"1px solid " + T.borderSub, background:T.surface, paddingBottom:"calc(12px + env(safe-area-inset-bottom))" }}>
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              <button onClick={() => setShowQuickQ(!showQuickQ)} style={{
                width:48, height:48, borderRadius:12, border:"1.5px solid",
                borderColor: showQuickQ ? "rgba(6,182,212,0.5)" : T.border,
                background: showQuickQ ? "rgba(6,182,212,0.08)" : "transparent",
                color: showQuickQ ? "#22d3ee" : T.textMuted,
                fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
              }}>💡</button>
              <textarea ref={inputRef} className="mi" value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(question); } }}
                placeholder='Ask anything — or "Compare with measure 047"'
                rows={1} style={{ resize:"none", lineHeight:1.6, padding:"12px 14px", minHeight:48, maxHeight:120, overflowY:"auto" }}
                onInput={e => { e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"; }} />
              <button className="send-btn" onClick={() => sendMessage(question)} disabled={loading || !question.trim()}>
                {loading ? <span className="spin" style={{ fontSize:16 }}>⚡</span> : "→"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Change Measure Modal ── */}
      {showChangeModal && (
        <div className="overlay" onClick={e => { if (e.target===e.currentTarget) setShowChangeModal(false); }}>
          <div className="mips-modal fade">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:18, fontWeight:800, color:T.text }}>Change Measure</div>
              <button onClick={() => setShowChangeModal(false)} style={{ background:"none", border:"none", color:T.textMuted, fontSize:22, cursor:"pointer" }}>✕</button>
            </div>
            <MeasureForm inModal={true} />
          </div>
        </div>
      )}
    </div>
  );
}