/**
 * DevTools.jsx — All developer tools in one hub
 * Mobile-first redesign — matches App.jsx patterns
 * Tools: Git Diff, Explainer, Refactor, TestGen, DocWriter,
 *        SQL, SecretScan, DepAudit, Regex, Architecture,
 *        HIPAA, FHIR, API Contract
 */

import { useState, useRef, useEffect } from "react";
import HelpPanel from "./Helppanel";

const SERVER = "https://codescan-server.onrender.com";

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  // Easy
  { id:"diff",     icon:"🔀", label:"Git Diff",        group:"easy",   color:"#06b6d4" },
  { id:"explain",  icon:"💡", label:"Explainer",        group:"easy",   color:"#8b5cf6" },
  { id:"refactor", icon:"♻️", label:"Refactor",         group:"easy",   color:"#10b981" },
  { id:"testgen",  icon:"🧪", label:"Test Generator",   group:"easy",   color:"#f59e0b" },
  { id:"docwrite", icon:"📝", label:"Doc Writer",       group:"easy",   color:"#ec4899" },
  // Medium
  { id:"sql",      icon:"🗄️", label:"SQL Reviewer",    group:"medium", color:"#3b82f6" },
  { id:"secrets",  icon:"🔑", label:"Secret Scanner",   group:"medium", color:"#ef4444" },
  { id:"deps",     icon:"📦", label:"Dep Auditor",      group:"medium", color:"#f97316" },
  { id:"regex",    icon:"🔍", label:"Regex Explainer",  group:"medium", color:"#06b6d4" },
  { id:"arch",     icon:"🏗️", label:"Architecture",    group:"medium", color:"#14b8a6" },
  // Hard / EHR
  { id:"hipaa",    icon:"🏥", label:"HIPAA Checker",    group:"hard",   color:"#f43f5e" },
  { id:"fhir",     icon:"📋", label:"FHIR Validator",   group:"hard",   color:"#8b5cf6" },
  { id:"apicon",   icon:"🔗", label:"API Contract",     group:"hard",   color:"#22c55e" },
];

const GROUP_LABELS = { easy:"⚡ Quick Tools", medium:"🛠️ Mid-Level", hard:"🏥 EHR / Compliance" };

// ── System prompts ────────────────────────────────────────────────────────────
const PROMPTS = {
  diff: (input) => `You are a senior code reviewer. Review ONLY the changed lines in this Git diff.
For each changed chunk:
- State what changed and why it matters
- Flag bugs, security issues, or bad practices introduced
- Praise good improvements
- Suggest improvements if needed
Format with ## for file names, ### for issue categories. Be concise and direct.

GIT DIFF:
${input}`,

  explain: (input, opts) => `You are a patient senior engineer explaining code to a ${opts.level || "junior"} developer.
Explain this code clearly:
1. **What it does** — plain English summary
2. **How it works** — step by step walkthrough of the logic
3. **Key concepts** — any patterns, algorithms, or language features used
4. **Gotchas** — anything tricky or non-obvious
5. **Example** — a concrete real-world use case

Use simple language. Avoid jargon unless you explain it. Use analogies where helpful.

CODE:
${input}`,

  refactor: (input, opts) => `You are a world-class software engineer. Refactor this ${opts.lang || "code"} to be cleaner, more maintainable, and more efficient.

Provide:
## Refactored Code
\`\`\`
[the improved code]
\`\`\`
## What Changed
List every change made with a brief reason for each.
## Why It's Better
Overall summary of the improvements.

Keep the same functionality. Do not change the public API/interface unless broken.

ORIGINAL CODE:
${input}`,

  testgen: (input, opts) => `You are a testing expert. Generate comprehensive unit tests for this ${opts.lang || "code"} using ${opts.framework || "the appropriate test framework"}.

Cover:
- Happy path (normal inputs)
- Edge cases (empty, null, zero, max values)
- Error cases (invalid input, exceptions)
- Boundary conditions

For each test: clear name, arrange/act/assert structure, comment explaining what's being tested.
Generate at least 8-12 tests. Include any necessary mocks or fixtures.

CODE TO TEST:
${input}`,

  docwrite: (input, opts) => `You are a technical writer. Generate complete documentation for this ${opts.lang || "code"}.

Generate:
1. **JSDoc/Docstring** for every function, class, and method — include @param, @returns, @throws, @example
2. **Module-level comment** explaining what this file/module does
3. **Inline comments** for any complex logic (show placement, don't modify code)
4. **README snippet** — a short usage example showing how to use the main function(s)

Output the fully documented version of the code, then the README snippet separately.

CODE:
${input}`,

  sql: (input) => `You are a senior database engineer and SQL security expert. Review this SQL code thoroughly.

Check for:
## 🔴 Security Issues
- SQL injection vulnerabilities
- Missing parameterization
- Exposed sensitive data

## ⚡ Performance Issues  
- Missing indexes (suggest which columns)
- N+1 query patterns
- Unnecessary full table scans
- Missing LIMIT clauses
- Inefficient JOINs or subqueries

## 🏗️ Structure & Best Practices
- Naming conventions
- Normalization issues
- Missing constraints (NOT NULL, UNIQUE, FK)
- Transaction handling

## ✅ Fixed Version
Provide the corrected SQL with all issues resolved.

SQL CODE:
${input}`,

  secrets: (input) => `You are a security expert scanning for exposed credentials and secrets.

Scan this code/config and identify:
## 🔴 Critical — Exposed Secrets
Any hardcoded: API keys, passwords, tokens, private keys, connection strings, credentials
For each: exact line/location, what type of secret, severity, how to fix

## 🟡 Warning — Potential Issues  
Suspicious patterns that may be secrets (even if partially obfuscated)

## 🟢 Secure Patterns Found
Any correct secret handling already present (env vars, vaults, etc.)

## Fix Plan
Step-by-step: how to remediate each finding, what to rotate, where to move secrets

Be exhaustive. Flag everything that looks like it could be a credential.

CODE/CONFIG:
${input}`,

  deps: (input) => `You are a dependency security and maintenance expert. Audit this dependency file.

Analyze:
## 🔴 Security Vulnerabilities
Known CVEs or vulnerability patterns in listed packages + recommended safe versions

## 🟡 Outdated Packages
Packages significantly behind current versions + what major features/fixes they're missing

## 🟢 Well-Maintained Dependencies
Packages that are current and well-maintained

## 📋 Action Plan
Prioritized list: what to update immediately vs. can wait + migration notes for breaking changes

DEPENDENCY FILE:
${input}`,

  regex: (input, opts) => `You are a regex expert. Analyze this regular expression.

## What It Matches
Plain English description of what this regex matches and doesn't match

## Step-by-Step Breakdown
Explain each part of the regex: quantifiers, groups, character classes, anchors, etc.

## Potential Issues
- Edge cases it misses
- Catastrophic backtracking risks
- Unicode/encoding issues

## Test Cases
5+ examples of strings it matches and 5+ it doesn't (with why)
${opts.testStr ? `\nTest against this string: "${opts.testStr}"` : ""}

## Improved Version (if needed)
A cleaner or more robust alternative with explanation

REGEX:
${input}`,

  arch: (input) => `You are a software architect. Review this codebase for architectural quality.

## 🏗️ Architecture Overview
What pattern is being used (MVC, layered, microservices, etc.) and how well it's implemented

## 🔴 Critical Issues
Circular dependencies, god objects, tight coupling, violated separation of concerns

## 🟡 Design Smells
Code that will cause maintainability problems as the project grows

## 🟢 Good Patterns
Well-structured parts worth preserving

## Dependency Map
Key dependencies between modules/files and whether they're healthy

## Refactoring Roadmap
Prioritized list of architectural improvements with estimated impact

FILES:
${input}`,

  hipaa: (input) => `You are a HIPAA compliance expert and healthcare security engineer.

Audit for HIPAA Technical Safeguard violations:

## 🔴 PHI Exposure Risks (Critical)
- Patient data logged to console/files without masking
- PHI in URLs, query params, or error messages
- Unencrypted storage of patient data
- PHI transmitted without TLS

## 🔴 Access Control Issues
- Missing authentication checks before PHI access
- No role-based access control (RBAC)
- Hardcoded user permissions

## 🟡 Audit Trail Gaps
- Missing access logging for PHI reads/writes
- No audit trail for data modifications
- Insufficient error logging (too much or too little)

## 🟡 Minimum Necessary Violations
- Fetching more PHI than needed for the operation
- Exposing full records when partial data suffices

## ✅ Compliant Patterns
Good HIPAA practices already in place

## Remediation Plan
Specific code changes needed, prioritized by risk

CODE:
${input}`,

  fhir: (input) => `You are an HL7 FHIR R4 specification expert. Validate this FHIR resource or HL7 message.

## ✅ Valid Elements
Correctly structured elements that comply with the spec

## 🔴 Spec Violations (Critical)
- Required fields missing
- Wrong data types
- Invalid code system references
- Cardinality violations

## 🟡 Best Practice Issues
- Missing recommended (but not required) fields
- Incorrect use of extensions
- Suboptimal coding choices

## 🔗 Terminology Issues
- Invalid SNOMED/LOINC/ICD codes
- Wrong code system OIDs
- Missing display values

## 📋 Corrected Resource
The fixed, valid FHIR JSON/XML

## Profile Compliance
Which US Core or other profiles this might need to comply with

FHIR RESOURCE / HL7 MESSAGE:
${input}`,

  apicon: (input) => `You are an API design expert and security engineer reviewing an API specification.

Audit this OpenAPI/Swagger spec or API definition:

## 🔴 Security Issues
- Missing authentication (no security schemes defined)
- Endpoints without auth requirements
- Sensitive data in GET params
- No rate limiting specified
- CORS misconfiguration

## 🟡 Design Issues
- Non-RESTful naming (verbs in URLs, inconsistent pluralization)
- Wrong HTTP methods for operations
- Missing or wrong status codes
- Inconsistent error response schemas
- Breaking change risks

## 📝 Documentation Gaps
- Missing descriptions on endpoints/params
- No example requests/responses
- Undocumented error cases

## 🔒 Data Exposure
- Over-returning data (response schemas exposing sensitive fields)
- Missing field-level filtering

## ✅ Good Practices Found
Well-designed aspects worth keeping

## Improved Spec Snippet
Key corrections shown as fixed YAML/JSON

API SPEC:
${input}`,
};

// ── Tool input configs ────────────────────────────────────────────────────────
const TOOL_CONFIG = {
  diff:     { placeholder:"Paste your git diff here (git diff output)...", label:"Git Diff", rows:18 },
  explain:  { placeholder:"Paste the code you want explained...", label:"Code", rows:14,
              extras: [{key:"level", label:"Audience", options:["junior developer","mid-level developer","senior developer","non-technical stakeholder"]}] },
  refactor: { placeholder:"Paste the code to refactor...", label:"Code", rows:14,
              extras: [{key:"lang", label:"Language", options:["JavaScript","TypeScript","Python","Java","Go","Rust","C#","PHP","Ruby"]}] },
  testgen:  { placeholder:"Paste the function/class to generate tests for...", label:"Code", rows:14,
              extras: [
                {key:"lang", label:"Language", options:["JavaScript","TypeScript","Python","Java","Go","Rust","C#"]},
                {key:"framework", label:"Framework", options:["Jest","Vitest","Mocha","PyTest","JUnit","Go test","xUnit","RSpec"]},
              ]},
  docwrite: { placeholder:"Paste the code to document...", label:"Code", rows:14,
              extras: [{key:"lang", label:"Language", options:["JavaScript","TypeScript","Python","Java","Go","Rust","C#"]}] },
  sql:      { placeholder:"Paste your SQL query or schema...", label:"SQL", rows:14 },
  secrets:  { placeholder:"Paste code, config files, .env examples, docker-compose.yml, etc...", label:"Code / Config", rows:14 },
  deps:     { placeholder:"Paste package.json, requirements.txt, Gemfile, go.mod, pom.xml, etc...", label:"Dependency File", rows:14 },
  regex:    { placeholder:"Paste the regular expression (just the pattern, without delimiters)...", label:"Regex Pattern", rows:4,
              extras: [{key:"testStr", label:"Test String (optional)", type:"text", placeholder:"String to test against..."}] },
  arch:     { placeholder:"Paste multiple files separated by // filename.js\n[code]\n// filename2.js\n[code]...", label:"Files", rows:18 },
  hipaa:    { placeholder:"Paste the code that handles patient data (routes, controllers, models, queries)...", label:"Code", rows:14 },
  fhir:     { placeholder:"Paste the FHIR JSON resource or HL7 message...", label:"FHIR Resource / HL7", rows:16 },
  apicon:   { placeholder:"Paste the OpenAPI/Swagger YAML or JSON spec, or describe your API endpoints...", label:"API Spec", rows:16 },
};

// ── Main component ────────────────────────────────────────────────────────────
export default function DevTools({ isDark = true }) {
  const [activeTool, setActiveTool] = useState("diff");
  const [activePanel, setActivePanel] = useState("input"); // mobile: "input" | "result"
  const [inputs, setInputs]         = useState({});
  const [extras, setExtras]         = useState({});
  const [results, setResults]       = useState({});
  const [running, setRunning]       = useState({});
  const [errors, setErrors]         = useState({});
  const [isMobile, setIsMobile]     = useState(window.innerWidth < 768);
  const fileInputRef                = useRef(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Theme — same token set as App.jsx
  const T = {
    bg:       isDark ? "#07080f" : "#f1f5f9",
    surface:  isDark ? "#0d0f1a" : "#ffffff",
    surface2: isDark ? "#111827" : "#f8fafc",
    border:   isDark ? "#1e2030" : "#e2e8f0",
    text:     isDark ? "#e2e8f0" : "#0f172a",
    textSub:  isDark ? "#9ca3af" : "#64748b",
    textMuted:isDark ? "#374151" : "#94a3b8",
    inputBg:  isDark ? "#0d0f1a" : "#f8fafc",
  };

  const tool = TOOLS.find(t => t.id === activeTool);
  const cfg  = TOOL_CONFIG[activeTool];

  const setInput = (v)         => setInputs(p  => ({ ...p, [activeTool]: v }));
  const setExtra = (k, v)      => setExtras(p  => ({ ...p, [activeTool]: { ...(p[activeTool]||{}), [k]: v } }));
  const getInput = ()          => inputs[activeTool]  || "";
  const getExtra = (k, def="") => (extras[activeTool] || {})[k] || def;

  // Switch tool — on mobile jump to input panel
  const handleToolSelect = (id) => {
    setActiveTool(id);
    setActivePanel("input");
  };

  const run = async () => {
    const input = getInput().trim();
    if (!input) return;
    const tid = activeTool;
    setRunning(p => ({ ...p, [tid]: true }));
    setErrors(p  => ({ ...p, [tid]: null }));
    setResults(p => ({ ...p, [tid]: null }));
    // On mobile — auto-navigate to result panel
    if (isMobile) setActivePanel("result");

    try {
      const opts = extras[tid] || {};
      const prompt = PROMPTS[tid](input, opts);
      const res = await fetch(SERVER + "/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error("Server error " + res.status);
      const data = await res.json();
      const text = (data.content || []).map(c => c.text || "").join("") || data.choices?.[0]?.message?.content || "";
      setResults(p => ({ ...p, [tid]: text }));
    } catch (e) {
      setErrors(p => ({ ...p, [tid]: e.message.includes("fetch") ? "Server waking up — try again in 30s." : e.message }));
    } finally {
      setRunning(p => ({ ...p, [tid]: false }));
    }
  };

  // ── Markdown renderer ────────────────────────────────────────────────────
  const fmt = (text) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      if (!line.trim()) return <div key={i} style={{ height:6 }} />;
      if (line.startsWith("## "))
        return <div key={i} style={{ fontSize:14, fontWeight:700, color:T.text, marginTop:18, marginBottom:6, fontFamily:"'Bricolage Grotesque',sans-serif", borderBottom:"1px solid " + T.border, paddingBottom:4 }}>{line.slice(3)}</div>;
      if (line.startsWith("### "))
        return <div key={i} style={{ fontSize:13, fontWeight:700, color: isDark ? "#94a3b8" : "#475569", marginTop:12, marginBottom:4 }}>{line.slice(4)}</div>;
      if (line.startsWith("```"))
        return <div key={i} style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color: isDark?"#a5b4fc":"#4338ca", background: isDark?"rgba(99,102,241,0.08)":"rgba(99,102,241,0.06)", borderLeft:"3px solid #6366f1", padding:"2px 8px", borderRadius:"0 4px 4px 0", marginTop:2 }} />;
      if (line.startsWith("- ") || line.startsWith("• "))
        return <div key={i} style={{ paddingLeft:16, marginBottom:4, color:T.textSub, fontSize:13, lineHeight:1.65, display:"flex", gap:8 }}><span style={{ color:tool.color, flexShrink:0 }}>·</span><span>{line.slice(2)}</span></div>;
      const html = line
        .replace(/`([^`]+)`/g, '<code style="background:' + (isDark?"rgba(99,102,241,0.12)":"rgba(99,102,241,0.08)") + ';color:' + (isDark?"#a5b4fc":"#4338ca") + ';padding:1px 6px;border-radius:4px;font-size:12px;font-family:DM Mono,monospace">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:' + T.text + ';font-weight:700">$1</strong>');
      return <div key={i} style={{ color:T.textSub, fontSize:13, lineHeight:1.75, marginBottom:2 }} dangerouslySetInnerHTML={{ __html: html }} />;
    });
  };

  const inputVal  = getInput();
  const resultVal = results[activeTool];
  const isRunning = running[activeTool];
  const errVal    = errors[activeTool];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", height: isMobile ? "calc(100vh - 65px - 72px)" : "calc(100vh - 65px)", background:T.bg, fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@700;800&display=swap');

        /* ── Inputs ── */
        .dt-textarea { width:100%; background:${T.inputBg}; border:1.5px solid ${T.border}; color:${T.text}; padding:14px; border-radius:10px; font-family:'DM Mono',monospace; font-size:13px; outline:none; resize:vertical; line-height:1.6; transition:border-color 0.2s; box-sizing:border-box; }
        .dt-textarea:focus { border-color:${tool.color}; }
        .dt-select { background:${T.inputBg}; border:1.5px solid ${T.border}; color:${T.text}; padding:8px 12px; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:13px; outline:none; cursor:pointer; }
        .dt-input  { background:${T.inputBg}; border:1.5px solid ${T.border}; color:${T.text}; padding:9px 12px; border-radius:8px; font-family:'DM Mono',monospace; font-size:13px; outline:none; width:100%; box-sizing:border-box; }
        .dt-input:focus, .dt-select:focus { border-color:${tool.color}; }

        /* ── Sidebar tool buttons (desktop) ── */
        .dt-tool-btn { display:flex; align-items:center; gap:8px; padding:9px 12px; border-radius:8px; border:none; background:transparent; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; text-align:left; width:100%; transition:all 0.15s; }
        .dt-tool-btn:hover { background:${isDark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)"}; }
        .dt-tool-btn.active { background:${isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)"}; font-weight:700; }

        /* ── Mobile tool strip buttons ── */
        .dt-strip-btn { display:flex; flex-direction:column; align-items:center; gap:3px; padding:8px 10px; border-radius:10px; border:none; background:transparent; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:10px; font-weight:600; white-space:nowrap; transition:all 0.15s; flex-shrink:0; color:${T.textSub}; }
        .dt-strip-btn.active { background:${isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)"}; }
        .dt-strip-btn:hover { background:${isDark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.04)"}; }

        /* ── Panel toggle (like cc-panel-toggle in App.jsx) ── */
        .dt-panel-toggle { display:flex; background:${T.inputBg}; border:1px solid ${T.border}; border-radius:10px; padding:3px; gap:3px; }
        .dt-panel-btn { flex:1; padding:8px 12px; border-radius:8px; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; transition:all 0.15s; background:transparent; color:${T.textSub}; }
        .dt-panel-btn.active { background:${T.surface}; color:${tool.color}; box-shadow:0 1px 4px rgba(0,0,0,0.2); }

        /* ── Action buttons ── */
        .dt-run-btn { background:linear-gradient(135deg,${tool.color},${isDark?"#6366f1":"#4f46e5"}); border:none; color:white; padding:14px 24px; border-radius:12px; cursor:pointer; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:15px; transition:all 0.2s; width:100%; min-height:52px; box-shadow:0 4px 20px rgba(0,0,0,0.2); }
        .dt-run-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .dt-run-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 6px 24px rgba(0,0,0,0.3); }
        .dt-copy-btn { padding:6px 12px; border-radius:6px; border:1.5px solid ${T.border}; background:transparent; color:${T.textSub}; font-size:11px; cursor:pointer; font-family:'DM Sans',sans-serif; font-weight:600; transition:all 0.15s; }
        .dt-copy-btn:hover { border-color:${tool.color}; color:${tool.color}; }

        /* ── Animations ── */
        .spin { animation:spin 1s linear infinite; display:inline-block; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .fade-in { animation:fadeIn 0.2s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-3px)} to{opacity:1;transform:translateY(0)} }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${T.border}; border-radius:4px; }

        /* ── Responsive helpers ── */
        .dt-desktop-only { display:flex; }
        .dt-mobile-only  { display:none; }
        @media (max-width: 767px) {
          .dt-desktop-only { display:none !important; }
          .dt-mobile-only  { display:flex !important; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════
          MOBILE — horizontal tool strip + panel toggle
      ══════════════════════════════════════════════════════════════ */}

      {/* Mobile: grouped tool strip */}
      <div className="dt-mobile-only" style={{ flexDirection:"column", borderBottom:"1px solid " + T.border, background:T.surface, flexShrink:0 }}>
        {Object.entries(GROUP_LABELS).map(([group, groupLabel]) => (
          <div key={group} style={{ borderBottom: group !== "hard" ? "1px solid " + T.border : "none" }}>
            <div style={{ fontSize:9, color:T.textMuted, fontWeight:700, letterSpacing:"1.4px", textTransform:"uppercase", padding:"6px 14px 2px" }}>
              {groupLabel}
            </div>
            <div style={{ display:"flex", overflowX:"auto", padding:"4px 8px 8px", gap:2 }}>
              {TOOLS.filter(t => t.group === group).map(t => (
                <button key={t.id} className={"dt-strip-btn" + (activeTool===t.id?" active":"")}
                  onClick={() => handleToolSelect(t.id)}
                  style={{ color: activeTool===t.id ? t.color : T.textSub }}>
                  <span style={{ fontSize:18, position:"relative" }}>
                    {t.icon}
                    {results[t.id] && <span style={{ position:"absolute", top:-2, right:-2, width:6, height:6, borderRadius:"50%", background:t.color }} />}
                  </span>
                  <span style={{ fontSize:9 }}>{t.label.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: tool header + panel toggle */}
      <div className="dt-mobile-only" style={{ flexDirection:"column", padding:"10px 14px", gap:10, borderBottom:"1px solid " + T.border, background:T.surface, flexShrink:0 }}>
        {/* Tool identity */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:"linear-gradient(135deg," + tool.color + ",#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
            {tool.icon}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:14, fontWeight:800, color:T.text, lineHeight:1.1 }}>{tool.label}</div>
            <div style={{ fontSize:9, color:T.textMuted, textTransform:"uppercase", letterSpacing:"0.8px", marginTop:1 }}>{GROUP_LABELS[tool.group]}</div>
          </div>
          {resultVal && (
            <button className="dt-copy-btn" style={{ fontSize:10, flexShrink:0 }}
              onClick={() => navigator.clipboard.writeText(resultVal)}>
              📋 Copy
            </button>
          )}
        </div>
        {/* Panel toggle */}
        <div className="dt-panel-toggle">
          <button className={"dt-panel-btn" + (activePanel==="input"?" active":"")} onClick={() => setActivePanel("input")}>
            ✏️ Input
          </button>
          <button className={"dt-panel-btn" + (activePanel==="result"?" active":"")} onClick={() => setActivePanel("result")}>
            📊 Result {resultVal && "·✓"}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SHARED BODY — splits into desktop sidebar+panes / mobile single column
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ── Desktop: LEFT SIDEBAR ── */}
        <div className="dt-desktop-only" style={{ width:200, flexShrink:0, borderRight:"1px solid " + T.border, background:T.surface, overflowY:"auto", padding:"12px 8px", flexDirection:"column" }}>
          {Object.entries(GROUP_LABELS).map(([group, groupLabel]) => (
            <div key={group} style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, color:T.textMuted, fontWeight:700, letterSpacing:"1.2px", textTransform:"uppercase", padding:"0 8px", marginBottom:6 }}>
                {groupLabel}
              </div>
              {TOOLS.filter(t => t.group === group).map(t => (
                <button key={t.id} className={"dt-tool-btn" + (activeTool===t.id?" active":"")}
                  onClick={() => handleToolSelect(t.id)}
                  style={{ color: activeTool===t.id ? t.color : T.textSub }}>
                  <span style={{ fontSize:15 }}>{t.icon}</span>
                  <span>{t.label}</span>
                  {results[t.id] && <span style={{ marginLeft:"auto", width:6, height:6, borderRadius:"50%", background:t.color, flexShrink:0 }} />}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* ── Desktop: MAIN AREA / Mobile: FULL AREA ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Desktop-only tool header */}
          <div className="dt-desktop-only" style={{ padding:"14px 20px", borderBottom:"1px solid " + T.border, background:T.surface, alignItems:"center", gap:12, flexShrink:0 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg," + tool.color + ",#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
              {tool.icon}
            </div>
            <div>
              <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:16, fontWeight:800, color:T.text }}>{tool.label}</div>
              <div style={{ fontSize:11, color:T.textMuted, textTransform:"uppercase", letterSpacing:"0.8px" }}>{GROUP_LABELS[tool.group]}</div>
            </div>
            {resultVal && (
              <button className="dt-copy-btn" style={{ marginLeft:"auto" }}
                onClick={() => navigator.clipboard.writeText(resultVal)}>
                📋 Copy Result
              </button>
            )}
          </div>

          {/* Input + Result panels */}
          <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

            {/* ── INPUT PANE ── */}
            {(!isMobile || activePanel === "input") && (
              <div style={{
                width: isMobile ? "100%" : "45%",
                borderRight: isMobile ? "none" : "1px solid " + T.border,
                display:"flex", flexDirection:"column",
                padding: isMobile ? "16px" : "20px",
                gap:12, overflowY:"auto"
              }}>
                {/* Extra options */}
                {cfg.extras && cfg.extras.map(ex => (
                  <div key={ex.key}>
                    <div style={{ fontSize:11, color:T.textMuted, textTransform:"uppercase", letterSpacing:"1.2px", marginBottom:6, fontWeight:600 }}>{ex.label}</div>
                    {ex.options ? (
                      <select className="dt-select" value={getExtra(ex.key, ex.options[0])} onChange={e => setExtra(ex.key, e.target.value)}>
                        {ex.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="dt-input" placeholder={ex.placeholder || ""} value={getExtra(ex.key)} onChange={e => setExtra(ex.key, e.target.value)} />
                    )}
                  </div>
                ))}

                {/* Main input */}
                <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ fontSize:11, color:T.textMuted, textTransform:"uppercase", letterSpacing:"1.2px", fontWeight:600 }}>{cfg.label}</div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button className="dt-copy-btn" onClick={() => setInput("")} style={{ fontSize:10 }}>Clear</button>
                      <button className="dt-copy-btn" onClick={() => fileInputRef.current?.click()} style={{ fontSize:10 }}>📁 Load File</button>
                    </div>
                  </div>
                  <textarea className="dt-textarea"
                    rows={isMobile ? Math.min(cfg.rows || 14, 10) : (cfg.rows || 14)}
                    placeholder={cfg.placeholder}
                    value={inputVal}
                    onChange={e => setInput(e.target.value)}
                    style={{ flex:1, minHeight: isMobile ? 160 : (cfg.rows || 14) * 22 }}
                  />
                </div>

                <button className="dt-run-btn" onClick={run} disabled={isRunning || !inputVal.trim()}>
                  {isRunning ? <><span className="spin">⚡</span> Analyzing...</> : `${tool.icon} Run ${tool.label}`}
                </button>

                <input ref={fileInputRef} type="file" style={{ display:"none" }}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (file) { const text = await file.text(); setInput(text); e.target.value = ""; }
                  }} />
              </div>
            )}

            {/* ── RESULT PANE ── */}
            {(!isMobile || activePanel === "result") && (
              <div style={{
                flex:1,
                overflowY:"auto",
                padding: isMobile ? "16px" : "20px",
                width: isMobile ? "100%" : undefined,
              }}>
                {!resultVal && !isRunning && !errVal && (
                  <div style={{ height:"100%", minHeight:240, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, opacity:0.25 }}>
                    <div style={{ fontSize:isMobile?44:56 }}>{tool.icon}</div>
                    <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:isMobile?16:20, fontWeight:800, color:T.text }}>
                      {tool.label}
                    </div>
                    <div style={{ fontSize:13, color:T.textSub, textAlign:"center", maxWidth:260, lineHeight:1.7 }}>
                      {cfg.placeholder.slice(0, 70)}...
                    </div>
                    {isMobile && (
                      <button className="dt-copy-btn" onClick={() => setActivePanel("input")} style={{ opacity:1, marginTop:4 }}>
                        ✏️ Go to Input
                      </button>
                    )}
                  </div>
                )}

                {isRunning && (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:"60px 20px" }}>
                    <div style={{ width:52, height:52, border:"3px solid " + T.border, borderTopColor:tool.color, borderRadius:"50%" }} className="spin" />
                    <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:15, fontWeight:700, color:T.text }}>
                      Analyzing with AI...
                    </div>
                    <div style={{ fontSize:12, color:T.textMuted }}>This usually takes 5–15 seconds</div>
                  </div>
                )}

                {errVal && (
                  <div className="fade-in" style={{ background: isDark?"rgba(248,113,113,0.08)":"rgba(254,202,202,0.4)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:12, padding:"14px 18px", color:"#f87171", fontSize:13 }}>
                    ⚠️ {errVal}
                  </div>
                )}

                {resultVal && !isRunning && (
                  <div className="fade-in" style={{ lineHeight:1.7 }}>
                    {fmt(resultVal)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <HelpPanel tab="devtools" tool={activeTool} isDark={isDark} />
    </div>
  );
}