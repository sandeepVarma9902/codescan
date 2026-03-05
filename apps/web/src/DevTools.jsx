/**
 * DevTools.jsx — All developer tools in one hub
 * Uses the same /api/review proxy endpoint as Code Review
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
  { id:"rcm",      icon:"💊", label:"RCM Autonomous",   group:"hard",   color:"#0ea5e9" },
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

## 🟢 Healthy Dependencies  
Well-maintained, up-to-date packages

## 📦 Bloat & Redundancy
Packages that duplicate functionality, unnecessary for stated purpose, or have lighter alternatives

## Action Plan
Priority-ordered list: what to update now, what to watch, what to remove

DEPENDENCY FILE:
${input}`,

  regex: (input, opts) => `You are a regex expert. Analyze this regular expression.

Provide:
## 📖 Plain English Explanation
Explain what the regex matches in simple language, piece by piece.
Break down each token/group/quantifier with its meaning.

## 🧪 Test Cases
Show 5 strings that MATCH and 5 that DON'T MATCH with explanation why.

## ⚠️ Potential Issues
- Edge cases that might cause unexpected matches
- Catastrophic backtracking risks
- Common pitfalls

## 🔄 Improved Version  
If the regex can be made clearer, safer, or more efficient — show the improved version with explanation.

${opts.testStr ? "## Test Against Provided String\nInput: " + opts.testStr + "\nResult: [does it match or not, and which groups capture what]" : ""}

REGEX:
${input}`,

  arch: (input) => `You are a software architect reviewing multiple files for architectural quality.

Analyze:
## 🏗️ Architecture Overview
What pattern/architecture is being used? How well is it applied?

## 🔴 Critical Concerns
- Tight coupling between modules
- Violations of separation of concerns
- God classes/functions doing too much
- Missing abstractions

## 🟡 Design Smells
- Dependency direction issues
- Leaky abstractions
- Premature optimization or over-engineering

## 📁 Structure Recommendations
- How to reorganize files/folders
- What to extract into separate modules
- Interface/abstraction suggestions

## 🟢 Good Patterns Found
Architectural decisions worth keeping

FILES:
${input}`,

  hipaa: (input) => `You are a HIPAA compliance expert and security engineer reviewing code for a healthcare application.

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

  rcm: (input, opts) => {
    const mode = opts.mode || "claim_coding";

    if (mode === "claim_coding") return `You are a Certified Professional Coder (CPC) with 15+ years of RCM experience. Your task is to produce a complete, submission-ready coding package from the clinical documentation below.

CRITICAL RULES:
- Output ONLY the structured report using the exact section headers below. No preamble, no "Step 1/2/3", no reasoning chains, no LaTeX, no boxes.
- Every section MUST be populated. If data is missing, state "Not documented — recommend clarification" under that section.
- Use plain text and bullet points only. No markdown tables.

## 🧾 Encounter Summary
[2-3 sentence plain English summary: visit type, chief complaint, clinical context]

## 🔵 Primary Diagnosis — ICD-10-CM
[Code — Full description — Specificity note — POA: Y/N/U]

## 🟡 Secondary Diagnoses — ICD-10-CM
[For each: Code — Description — Sequencing rationale]

## 🟢 Procedures — CPT / HCPCS
[For each: Code — Description — Modifiers (with reason) — Units — POS — Medical necessity tied to DX]

## ⚡ E&M Level Assessment
- Recommended level: [99202–99215 or inpatient equivalent]
- MDM complexity: [Straightforward / Low / Moderate / High]
- Supporting evidence from the note

## ⚠️ Coding Flags & Risk Areas
[Unbundling risks, missing docs, NCCI edits, LCD/NCD concerns]

## 📋 Clean Claim Checklist
[Each required field: ✅ Present | ⚠️ Needs Clarification | ❌ Missing]

## 💡 Revenue Optimization Notes
[Missed charges, specificity improvements, legitimate undercoded services]

---
CLINICAL DOCUMENTATION:
${input}`;

    if (mode === "denial_analysis") return `You are a senior RCM denial management specialist. Produce a complete appeal package from the denial information below.

CRITICAL RULES:
- Output ONLY the structured report using the exact section headers below. No preamble, no "Step 1/2/3", no reasoning chains, no LaTeX, no boxes.
- Every section MUST be populated. If data is missing, state what is needed.
- The appeal letter must be complete and ready to send — do not leave placeholder gaps except for [Provider Name], [NPI], [Phone], [Date].

## 🔴 Denial Classification
- Denial type: [Clinical / Technical / Administrative / Contractual / Duplicate]
- CARC code: [code + description, or "Not provided"]
- RARC code: [code + description, or "Not provided"]
- Root cause: [one sentence]

## 📊 Denial Breakdown
[Plain English explanation of exactly why this was denied and what the payer needs]

## ⚖️ Appeal Viability Assessment
- Success probability: [High / Medium / Low] — [reason]
- Recommended appeal level: [First-level / Second-level / External / Peer-to-peer]
- Deadline: [standard timeline for this denial type]

## 🛠️ Corrective Actions Required
[Numbered list: exact steps to fix before resubmitting or appealing]

## ✉️ Appeal Letter — Ready to Send
[Complete, professional appeal letter. Include: date, patient name/DOB/claim #, denial reference, clinical/administrative argument, policy or guideline citations, specific requested action, closing. Use [Provider Name] / [NPI] / [Phone] as placeholders only.]

## 🔄 Future Prevention
[Process changes to prevent this denial type from recurring]

---
DENIAL / EOB / REMITTANCE DATA:
${input}`;

    if (mode === "prior_auth") return `You are a utilization management specialist and prior authorization expert. Produce a complete PA submission package.

CRITICAL RULES:
- Output ONLY the structured report using the exact section headers below. No preamble, no "Step 1/2/3", no reasoning chains, no LaTeX, no boxes.
- The PA letter must be clinically rigorous and complete — cite real guidelines (AHA, ACS, CMS, USPSTF, Milliman, InterQual).
- Every section MUST be populated.

## 🏥 Service Classification
- Procedure/service: [name]
- CPT/HCPCS code(s): [codes]
- Service category: [Inpatient / Outpatient / DME / Specialty Rx / Imaging / Other]
- Urgency: [Routine / Urgent / Emergent]

## 📋 Medical Necessity Analysis
- Documentation supports medical necessity: [Yes / Partial / No]
- Clinical criteria met: [InterQual/MCG criteria that apply]
- ICD-10 codes supporting medical necessity: [list]
- Documentation gaps that risk denial: [list or "None identified"]

## 📝 Prior Authorization Request Letter
[Complete, clinically rigorous PA letter. Include: patient demographics, primary DX + ICD-10, procedure + CPT, clinical rationale with evidence citations, conservative treatments already tried and failed, expected outcome and care plan, ordering provider attestation block with [Provider Name] / [NPI] / [Date] placeholders.]

## 🔍 Payer-Specific Considerations
- Common denial reasons for this procedure type: [list]
- Required supporting documents: [checklist]
- Peer-to-peer review recommended: [Yes/No] — talking points if yes

## 📊 Approval Probability & Strategy
- Likelihood of approval: [High / Medium / Low] — [reason]
- Best appeal pathway if denied: [specific steps]
- Alternative codes with better coverage: [if applicable]

---
CLINICAL NOTES / ORDER / PROCEDURE DETAILS:
${input}`;

    if (mode === "eligibility") return `You are a patient financial counselor and eligibility verification specialist. Produce a complete eligibility and benefits analysis from the data below.

CRITICAL RULES:
- Output ONLY the structured report using the exact section headers below. No preamble, no "Step 1/2/3", no reasoning chains, no LaTeX, no boxes.
- Every section MUST be populated using ONLY the data provided. Do not fabricate benefit amounts.
- If a field is not present in the input, write "Not provided — verify with payer" for that item.
- The Patient Financial Responsibility section must show actual numbers from the input, not generic advice.

## 🪪 Coverage Summary
[Plain English: insurer, plan name, member ID, effective dates, coverage type, any known gaps]

## 💰 Benefits Breakdown — Procedure-Specific
- In-Network / Out-of-Network status: [from input]
- Annual Deductible: [total] | Met YTD: [amount] | Remaining: [calculated]
- Out-of-Pocket Maximum: [total] | Met YTD: [amount] | Remaining: [calculated]
- Copay / Coinsurance for this service type: [amount or %]
- Visit limits or frequency restrictions: [if any]
- Authorization required: [Yes / No / Unknown]

## ⚠️ Coverage Alerts
[COB/primary-secondary order issues, referral requirements, lapsed coverage dates, Medicare/Medicaid flags, coordination notes]

## 💵 Patient Financial Responsibility Estimate
For each planned service:
- Service name (CPT if known): [name]
- Estimated billed amount: [$ or "Unknown"]
- Estimated allowed amount: [$ or "Unknown"]
- Patient responsibility: [calculated from deductible remaining + coinsurance]

## 📋 Collection Strategy
- Recommended upfront collection: [$ amount and rationale]
- Payment plan eligibility: [Yes / No / Assess]
- Financial assistance indicators: [charity care triggers, sliding scale, ACA CSR]

## 🔄 Next Steps Checklist
[Numbered, ordered action items to complete before the appointment or procedure]

---
ELIGIBILITY & BENEFITS DATA:
${input}`;

    return `You are an RCM expert. Output ONLY a structured analysis — no preamble, no step-by-step reasoning. Analyze:\n${input}`;
  },

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
  rcm: {
    label: "Clinical / Billing Data", rows: 16,
    extras: [{ key:"mode", label:"Analysis Type", options:["claim_coding","denial_analysis","prior_auth","eligibility"] }],
    placeholder: {
      claim_coding:    "Paste a clinical note, SOAP note, H&P, operative report, or discharge summary...",
      denial_analysis: "Paste the EOB, remittance advice, denial letter, or claim rejection details...",
      prior_auth:      "Paste clinical notes, order details, and the procedure needing authorization...",
      eligibility:     "Paste the eligibility response, benefits summary, or insurance card details...",
    },
  },
};

// ── RCM structured form definitions ──────────────────────────────────────────
const RCM_FORMS = {
  claim_coding: [
    { section:"Patient & Visit", fields:[
      { key:"patientName", label:"Patient Name",       type:"text",     placeholder:"Jane Doe" },
      { key:"dob",         label:"Date of Birth",      type:"text",     placeholder:"MM/DD/YYYY" },
      { key:"dos",         label:"Date of Service",    type:"text",     placeholder:"MM/DD/YYYY" },
      { key:"provider",    label:"Provider / Facility",type:"text",     placeholder:"Dr. Smith — General Hospital" },
      { key:"visitType",   label:"Visit Type",         type:"select",   options:["Office Visit","Emergency","Inpatient Admission","Outpatient Surgery","Telehealth","Other"] },
    ]},
    { section:"Clinical", fields:[
      { key:"chiefComplaint", label:"Chief Complaint",            type:"textarea", rows:2, placeholder:"Patient presents with..." },
      { key:"diagnoses",      label:"Diagnoses / Conditions",     type:"textarea", rows:3, placeholder:"One per line. Include chronic conditions." },
      { key:"procedures",     label:"Procedures Performed",       type:"textarea", rows:3, placeholder:"One per line. Include labs, imaging, treatments." },
      { key:"notes",          label:"Additional Clinical Notes",  type:"textarea", rows:3, placeholder:"Exam findings, assessment, plan..." },
    ]},
  ],
  denial_analysis: [
    { section:"Claim Info", fields:[
      { key:"claimNum",   label:"Claim Number",      type:"text", placeholder:"CLM-2024-XXXXX" },
      { key:"dos",        label:"Date of Service",   type:"text", placeholder:"MM/DD/YYYY" },
      { key:"billedAmt",  label:"Billed Amount",     type:"text", placeholder:"$0.00" },
      { key:"payer",      label:"Payer / Insurance", type:"text", placeholder:"Blue Cross Blue Shield" },
    ]},
    { section:"Denial Details", fields:[
      { key:"denialDate",   label:"Denial Date",           type:"text",   placeholder:"MM/DD/YYYY" },
      { key:"denialType",   label:"Denial Type",           type:"select", options:["Clinical","Technical","Administrative","Contractual","Duplicate","Other"] },
      { key:"carc",         label:"CARC Code (if known)",  type:"text",   placeholder:"e.g. 97" },
      { key:"rarc",         label:"RARC Code (if known)",  type:"text",   placeholder:"e.g. N30" },
      { key:"denialReason", label:"Denial Reason / Description", type:"textarea", rows:3, placeholder:"Paste the denial reason from the EOB or remittance..." },
      { key:"codesBilled",  label:"Codes Originally Billed",     type:"textarea", rows:2, placeholder:"CPT: 99213, ICD-10: J06.9..." },
    ]},
  ],
  prior_auth: [
    { section:"Patient & Provider", fields:[
      { key:"patientName", label:"Patient Name",     type:"text", placeholder:"Jane Doe" },
      { key:"dob",         label:"Date of Birth",    type:"text", placeholder:"MM/DD/YYYY" },
      { key:"diagnosis",   label:"Primary Diagnosis (ICD-10)", type:"text", placeholder:"M54.5 — Low back pain" },
      { key:"provider",    label:"Ordering Provider",type:"text", placeholder:"Dr. Smith, MD — Orthopedics" },
      { key:"npi",         label:"Provider NPI (optional)", type:"text", placeholder:"1234567890" },
    ]},
    { section:"Procedure & Justification", fields:[
      { key:"procedure",       label:"Procedure / Service",    type:"text",   placeholder:"MRI Lumbar Spine without contrast" },
      { key:"cpt",             label:"CPT Code(s)",            type:"text",   placeholder:"72148" },
      { key:"urgency",         label:"Urgency",                type:"select", options:["Routine (5–10 business days)","Urgent (24–72 hours)","Emergent (immediate)"] },
      { key:"clinicalSummary", label:"Clinical Justification", type:"textarea", rows:4, placeholder:"Patient has 6 weeks of conservative treatment without improvement. Symptoms include..." },
      { key:"priorTreatments", label:"Prior Treatments Tried", type:"textarea", rows:2, placeholder:"PT x6 weeks, ibuprofen 600mg TID x4 weeks..." },
    ]},
  ],
  eligibility: [
    { section:"Patient", fields:[
      { key:"patientName",  label:"Patient Name",       type:"text", placeholder:"Jane Doe" },
      { key:"dob",          label:"Date of Birth",      type:"text", placeholder:"MM/DD/YYYY" },
      { key:"serviceDate",  label:"Date of Service",    type:"text", placeholder:"MM/DD/YYYY" },
    ]},
    { section:"Insurance", fields:[
      { key:"insurer",       label:"Insurance Company", type:"text", placeholder:"Aetna" },
      { key:"planName",      label:"Plan Name",         type:"text", placeholder:"PPO Gold" },
      { key:"memberId",      label:"Member ID",         type:"text", placeholder:"W123456789" },
      { key:"groupNum",      label:"Group Number",      type:"text", placeholder:"G-123456 (optional)" },
      { key:"effectiveDate", label:"Coverage Effective Date", type:"text", placeholder:"01/01/2025" },
    ]},
    { section:"Benefits", fields:[
      { key:"deductible",    label:"Annual Deductible",          type:"text",   placeholder:"$1,500" },
      { key:"deductibleMet", label:"Deductible Met YTD",         type:"text",   placeholder:"$750" },
      { key:"oopMax",        label:"Out-of-Pocket Maximum",      type:"text",   placeholder:"$5,000" },
      { key:"oopMet",        label:"OOP Met YTD",                type:"text",   placeholder:"$1,200" },
      { key:"copay",         label:"Specialist Copay / Coinsurance", type:"text", placeholder:"$40 copay or 20% after deductible" },
      { key:"service",       label:"Service / Procedure Planned", type:"text",  placeholder:"Laparoscopic cholecystectomy (CPT 47562)" },
      { key:"network",       label:"Provider Network Status",    type:"select", options:["In-Network","Out-of-Network","Unknown"] },
    ]},
  ],
};

const assembleFormInput = (mode, formData) => {
  const sections = RCM_FORMS[mode] || [];
  return sections.map(({ section, fields }) => {
    const lines = fields
      .map(({ key, label }) => formData[key]?.trim() ? `${label}: ${formData[key].trim()}` : null)
      .filter(Boolean);
    return lines.length ? `=== ${section} ===\n${lines.join("\n")}` : null;
  }).filter(Boolean).join("\n\n");
};

// ── Main component ────────────────────────────────────────────────────────────
export default function DevTools({ isDark = true }) {
  const [activeTool, setActiveTool] = useState("diff");
  const [inputs, setInputs]         = useState({});
  const [extras, setExtras]         = useState({});
  const [results, setResults]       = useState({});
  const [running, setRunning]       = useState({});
  const [errors, setErrors]         = useState({});
  const [rcmInputTab, setRcmInputTab]   = useState("text");   // "text"|"form"|"scan"
  const [rcmFormData, setRcmFormData]   = useState({});       // { [mode]: { [key]: val } }
  const [rcmScanStatus, setRcmScanStatus] = useState(null);   // null|"loading"|"done"|"error"
  const [normalizing, setNormalizing]   = useState(false);
  const [rcmLimitsOpen, setRcmLimitsOpen] = useState(true);
  const fileInputRef  = useRef(null);
  const rcmScanRef    = useRef(null);

  // Theme
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

  const activePlaceholder = typeof cfg?.placeholder === "object"
    ? cfg.placeholder[getExtra("mode", Object.keys(cfg.placeholder)[0])] || ""
    : cfg?.placeholder || "";

  // ── RCM form helpers ─────────────────────────────────────────────────────
  const activeMode  = getExtra("mode", "claim_coding");
  const setFormField = (key, val) =>
    setRcmFormData(p => ({ ...p, [activeMode]: { ...(p[activeMode]||{}), [key]: val } }));
  const getFormField = (key) => (rcmFormData[activeMode] || {})[key] || "";

  // ── OCR: load Tesseract.js dynamically and extract text from image ────────
  const handleOcrFile = async (file) => {
    setRcmScanStatus("loading");
    try {
      if (!window.Tesseract) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://unpkg.com/tesseract.js@4/dist/tesseract.min.js";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const { data: { text } } = await window.Tesseract.recognize(file, "eng");
      setInput(text.trim());
      setRcmScanStatus("done");
      setRcmInputTab("text");
    } catch {
      setRcmScanStatus("error");
    }
  };

  // ── PDF: load PDF.js dynamically and extract all pages of text ───────────
  const handlePdfFile = async (file) => {
    setRcmScanStatus("loading");
    try {
      if (!window.pdfjsLib) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      }
      const ab  = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
      let fullText = `[PDF: ${file.name} — ${pdf.numPages} page(s)]\n\n`;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += `--- Page ${i} ---\n` + content.items.map(it => it.str).join(" ") + "\n\n";
      }
      setInput(fullText.trim());
      setRcmScanStatus("done");
      setRcmInputTab("text");
    } catch {
      setRcmScanStatus("error");
    }
  };

  // ── Smart file loader: routes by type ────────────────────────────────────
  const handleSmartFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const isImage = ["png","jpg","jpeg","gif","webp","tiff","bmp"].includes(ext);
    if (activeTool === "rcm" && isImage) { await handleOcrFile(file); return; }
    if (ext === "pdf") { await handlePdfFile(file); return; }
    const text = await file.text();
    setInput(text);
  };

  // ── FHIR/HL7 normalization pre-pass ──────────────────────────────────────
  const normalizeInput = async () => {
    const raw = getInput().trim();
    if (!raw || normalizing) return;
    setNormalizing(true);
    try {
      const res = await fetch(SERVER + "/api/review", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 2000,
          messages: [{ role:"user", content:
            `You are an HL7 FHIR R4 expert. The input below may be non-standard, proprietary, or malformed FHIR/HL7. Convert it to valid, well-structured FHIR R4 JSON. Output ONLY the normalized FHIR JSON — no explanation, no markdown.\n\nINPUT:\n${raw}` }],
        }),
      });
      const data = await res.json();
      const text = (data.content||[]).map(c=>c.text||"").join("") || data.choices?.[0]?.message?.content || "";
      if (text.trim()) setInput(text.trim());
    } catch {}
    finally { setNormalizing(false); }
  };

  // ── PDF download for RCM results ─────────────────────────────────────────
  const downloadPdf = async () => {
    const text = results[activeTool];
    if (!text) return;

    // Dynamically load jsPDF
    if (!window.jspdf) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });

    const modeLabels = { claim_coding:"Claim Coding", denial_analysis:"Denial Analysis", prior_auth:"Prior Authorization", eligibility:"Eligibility" };
    const mode = (extras["rcm"] || {}).mode || "claim_coding";
    const now  = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });

    // Header band
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, 210, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("RCM Autonomous — " + (modeLabels[mode] || "Analysis"), 14, 10);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Generated by CareCode · " + now, 14, 17);

    // Body text
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const lines = doc.splitTextToSize(text, 182);
    let y = 30;
    const pageH = 285;

    lines.forEach(line => {
      if (y > pageH) { doc.addPage(); y = 14; }
      // Style section headers (## lines)
      if (line.startsWith("## ") || line.startsWith("## ")) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(14, 165, 233);
        doc.text(line.replace(/^#+\s*/, ""), 14, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 30);
        y += 6;
      } else {
        doc.text(line, 14, y);
        y += 4.5;
      }
    });

    // Footer on every page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text("CareCode RCM Autonomous · Page " + i + " of " + pageCount, 14, 293);
    }

    doc.save("RCM-" + mode + "-" + Date.now() + ".pdf");
  };

  // Detect if current input looks like HL7 or non-JSON FHIR
  const looksLikeFhirHl7 = (t) => /^MSH\|/.test(t) || /^(EVN|PID|PV1|OBR|OBX)\|/.test(t) ||
    (/"resourceType"\s*:/.test(t) === false && /\b(Patient|Encounter|Observation|Condition)\b/.test(t));


  const run = async () => {
    // For RCM form mode, assemble form data into structured text first
    let input = getInput().trim();
    if (activeTool === "rcm" && rcmInputTab === "form") {
      input = assembleFormInput(activeMode, rcmFormData[activeMode] || {});
    }
    if (!input) return;

    // Multi-page awareness: annotate long denial/eligibility inputs
    const mode = (extras["rcm"] || {}).mode || "claim_coding";
    if (activeTool === "rcm" && input.length > 2500 && (mode === "denial_analysis" || mode === "eligibility")) {
      input += "\n\n[Note: This is a multi-page or complex document. Focus on the most financially and clinically significant information. Flag any sections that appear cut off or need manual review.]";
    }

    const tid = activeTool;
    setRunning(p => ({ ...p, [tid]: true }));
    setErrors(p  => ({ ...p, [tid]: null }));
    setResults(p => ({ ...p, [tid]: null }));

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
      if (line.startsWith("```")) {
        return <div key={i} style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color: isDark?"#a5b4fc":"#4338ca", background: isDark?"rgba(99,102,241,0.08)":"rgba(99,102,241,0.06)", borderLeft:"3px solid #6366f1", padding:"2px 8px", borderRadius:"0 4px 4px 0", marginTop:2 }}></div>;
      }
      if (line.startsWith("- ") || line.startsWith("• "))
        return <div key={i} style={{ paddingLeft:16, marginBottom:4, color:T.textSub, fontSize:13, lineHeight:1.65, display:"flex", gap:8 }}><span style={{ color:tool.color, flexShrink:0 }}>·</span><span>{line.slice(2)}</span></div>;
      // code blocks inside lines
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
    <div style={{ display:"flex", height:"calc(100vh - 65px)", background:T.bg, fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Bricolage+Grotesque:wght@700;800&display=swap');
        .dt-textarea { width:100%; background:${T.inputBg}; border:1.5px solid ${T.border}; color:${T.text}; padding:14px; border-radius:10px; font-family:'DM Mono',monospace; font-size:13px; outline:none; resize:vertical; line-height:1.6; transition:border-color 0.2s; }
        .dt-textarea:focus { border-color:${tool.color}; }
        .dt-select { background:${T.inputBg}; border:1.5px solid ${T.border}; color:${T.text}; padding:8px 12px; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:13px; outline:none; cursor:pointer; }
        .dt-input { background:${T.inputBg}; border:1.5px solid ${T.border}; color:${T.text}; padding:9px 12px; border-radius:8px; font-family:'DM Mono',monospace; font-size:13px; outline:none; width:100%; }
        .dt-input:focus, .dt-select:focus { border-color:${tool.color}; }
        .dt-tool-btn { display:flex; align-items:center; gap:8px; padding:9px 12px; border-radius:8px; border:none; background:transparent; cursor:pointer; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; text-align:left; width:100%; transition:all 0.15s; }
        .dt-tool-btn:hover { background:${isDark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)"}; }
        .dt-tool-btn.active { background:${isDark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)"}; font-weight:700; }
        .dt-run-btn { background:linear-gradient(135deg,${tool.color},${isDark?"#6366f1":"#4f46e5"}); border:none; color:white; padding:13px 28px; border-radius:10px; cursor:pointer; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:15px; transition:all 0.2s; min-width:140px; }
        .dt-run-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .dt-run-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 6px 20px rgba(0,0,0,0.3); }
        .spin { animation:spin 1s linear infinite; display:inline-block; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .dt-copy-btn { padding:6px 12px; border-radius:6px; border:1.5px solid ${T.border}; background:transparent; color:${T.textMuted}; font-size:11px; cursor:pointer; font-family:'DM Sans',sans-serif; font-weight:600; transition:all 0.15s; }
        .dt-copy-btn:hover { border-color:${tool.color}; color:${tool.color}; }
        .rcm-tab { padding:6px 14px; border-radius:8px; border:1.5px solid ${T.border}; background:transparent; color:${T.textSub}; font-size:12px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; }
        .rcm-tab.active { border-color:${tool.color}; background:${tool.color}22; color:${tool.color}; }
        .rcm-tab:hover:not(.active) { border-color:${T.textSub}; }
        .rcm-field-label { font-size:10px; color:${T.textSub}; text-transform:uppercase; letter-spacing:1px; font-weight:700; margin-bottom:4px; }
        .rcm-field-input { width:100%; background:${T.inputBg}; border:1.5px solid ${T.border}; color:${T.text}; padding:8px 10px; border-radius:7px; font-family:'DM Sans',sans-serif; font-size:12px; outline:none; box-sizing:border-box; transition:border-color 0.15s; }
        .rcm-field-input:focus { border-color:${tool.color}; }
        .rcm-section-title { font-size:10px; font-weight:800; color:${tool.color}; text-transform:uppercase; letter-spacing:1.4px; margin:10px 0 6px; font-family:'Bricolage Grotesque',sans-serif; }
        .rcm-scan-zone { border:2px dashed ${T.border}; border-radius:12px; padding:32px 20px; display:flex; flex-direction:column; align-items:center; gap:10; cursor:pointer; transition:all 0.2s; text-align:center; }
        .rcm-scan-zone:hover { border-color:${tool.color}; background:${tool.color}08; }
        .norm-btn { padding:5px 10px; border-radius:6px; border:1.5px solid rgba(251,191,36,0.4); background:rgba(251,191,36,0.08); color:#fbbf24; font-size:10px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; }
        .norm-btn:hover { background:rgba(251,191,36,0.15); }
        .norm-btn:disabled { opacity:0.4; cursor:not-allowed; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${T.border}; border-radius:4px; }
      `}</style>

      {/* ── LEFT SIDEBAR — tool picker ── */}
      <div style={{ width:200, flexShrink:0, borderRight:"1px solid " + T.border, background:T.surface, overflowY:"auto", padding:"12px 8px" }}>
        {Object.entries(GROUP_LABELS).map(([group, groupLabel]) => (
          <div key={group} style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, color:T.textMuted, fontWeight:700, letterSpacing:"1.2px", textTransform:"uppercase", padding:"0 8px", marginBottom:6 }}>
              {groupLabel}
            </div>
            {TOOLS.filter(t => t.group === group).map(t => (
              <button key={t.id} className={"dt-tool-btn" + (activeTool===t.id?" active":"")}
                onClick={() => setActiveTool(t.id)}
                style={{ color: activeTool===t.id ? t.color : T.textSub }}>
                <span style={{ fontSize:15 }}>{t.icon}</span>
                <span>{t.label}</span>
                {results[t.id] && <span style={{ marginLeft:"auto", width:6, height:6, borderRadius:"50%", background:t.color, flexShrink:0 }} />}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Tool header */}
        <div style={{ padding:"14px 20px", borderBottom:"1px solid " + T.border, background:T.surface, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg," + tool.color + ",#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
            {tool.icon}
          </div>
          <div>
            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:16, fontWeight:800, color:T.text }}>{tool.label}</div>
            <div style={{ fontSize:11, color:T.textMuted, textTransform:"uppercase", letterSpacing:"0.8px" }}>{GROUP_LABELS[tool.group]}</div>
          </div>
          {activeTool === "rcm" && (
            <div style={{ marginLeft:8, display:"flex", gap:6, flexWrap:"wrap" }}>
              {[["claim_coding","🧾 Coding"],["denial_analysis","🔴 Denial"],["prior_auth","📝 Prior Auth"],["eligibility","🪪 Eligibility"]].map(([m, lbl]) => {
                const isActive = getExtra("mode","claim_coding") === m;
                return (
                  <button key={m} onClick={() => setExtra("mode", m)}
                    style={{ padding:"4px 10px", borderRadius:20, border:"1.5px solid " + (isActive ? tool.color : T.border),
                      background: isActive ? tool.color + "22" : "transparent",
                      color: isActive ? tool.color : T.textSub, fontSize:11, fontWeight: isActive ? 700 : 500,
                      cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s" }}>
                    {lbl}
                  </button>
                );
              })}
            </div>
          )}
          {resultVal && (
            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              {activeTool === "rcm" && (
                <button className="dt-copy-btn" onClick={downloadPdf}
                  style={{ borderColor:"rgba(14,165,233,0.4)", color:"#0ea5e9" }}>
                  📄 Download PDF
                </button>
              )}
              <button className="dt-copy-btn"
                onClick={() => navigator.clipboard.writeText(resultVal)}>
                📋 Copy Result
              </button>
            </div>
          )}
        </div>

        {/* Input + Result split */}
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

          {/* Input pane */}
          <div style={{ width:"45%", borderRight:"1px solid " + T.border, display:"flex", flexDirection:"column", padding:20, gap:12, overflowY:"auto" }}>

            {/* RCM: Input mode tabs */}
            {activeTool === "rcm" && (
              <div style={{ display:"flex", gap:6 }}>
                {[["text","📝 Paste"],["form","📋 Form"],["scan","📷 Scan / PDF"]].map(([tab, lbl]) => (
                  <button key={tab} className={"rcm-tab" + (rcmInputTab===tab?" active":"")}
                    onClick={() => setRcmInputTab(tab)}>{lbl}</button>
                ))}
              </div>
            )}

            {/* Extra options (non-RCM) */}
            {cfg.extras && cfg.extras.map(ex => (
              activeTool === "rcm" && ex.key === "mode" ? null :
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

            {/* ── RCM: FORM MODE ── */}
            {activeTool === "rcm" && rcmInputTab === "form" && (
              <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:0 }}>
                {(RCM_FORMS[activeMode] || []).map(({ section, fields }) => (
                  <div key={section}>
                    <div className="rcm-section-title">{section}</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:10 }}>
                      {fields.map(f => (
                        <div key={f.key}>
                          <div className="rcm-field-label">{f.label}</div>
                          {f.type === "select" ? (
                            <select className="rcm-field-input" value={getFormField(f.key)} onChange={e => setFormField(f.key, e.target.value)}>
                              <option value="">— Select —</option>
                              {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : f.type === "textarea" ? (
                            <textarea className="rcm-field-input" rows={f.rows||2} placeholder={f.placeholder}
                              value={getFormField(f.key)} onChange={e => setFormField(f.key, e.target.value)}
                              style={{ resize:"vertical", lineHeight:1.5 }} />
                          ) : (
                            <input className="rcm-field-input" type="text" placeholder={f.placeholder}
                              value={getFormField(f.key)} onChange={e => setFormField(f.key, e.target.value)} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── RCM: SCAN MODE ── */}
            {activeTool === "rcm" && rcmInputTab === "scan" && (
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12 }}>
                <div className="rcm-scan-zone" onClick={() => rcmScanRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleSmartFile(e.dataTransfer.files[0]); }}>
                  <div style={{ fontSize:36 }}>
                    {rcmScanStatus === "loading" ? <span className="spin">⚙️</span>
                     : rcmScanStatus === "done"    ? "✅"
                     : rcmScanStatus === "error"   ? "❌"
                     : "📄"}
                  </div>
                  <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:14, fontWeight:800, color:T.text }}>
                    {rcmScanStatus === "loading" ? "Extracting text…"
                     : rcmScanStatus === "done"   ? "Extracted! Switched to Paste mode"
                     : rcmScanStatus === "error"  ? "Extraction failed — try a clearer image"
                     : "Drop image or PDF here"}
                  </div>
                  <div style={{ fontSize:12, color:T.textSub, lineHeight:1.6 }}>
                    {rcmScanStatus === "loading"
                      ? "This may take 10–30 seconds for OCR"
                      : "Supports: PNG, JPG, TIFF (OCR) · PDF (all pages extracted)\nHandwritten notes: print clearly for best results"}
                  </div>
                  {!rcmScanStatus || rcmScanStatus === "error" ? (
                    <button style={{ marginTop:4, padding:"7px 18px", borderRadius:8, border:"1.5px solid " + tool.color,
                      background:tool.color+"22", color:tool.color, fontSize:12, fontWeight:700,
                      cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                      📁 Choose File
                    </button>
                  ) : null}
                </div>
                <input ref={rcmScanRef} type="file" accept="image/*,.pdf" style={{ display:"none" }}
                  onChange={async e => { await handleSmartFile(e.target.files?.[0]); e.target.value=""; }} />
                <div style={{ fontSize:11, color:T.textSub, lineHeight:1.6, padding:"8px 12px",
                  background:isDark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)", borderRadius:8 }}>
                  <strong style={{ color:T.text }}>OCR tips for best results:</strong><br/>
                  Use typed/printed documents where possible · Ensure good lighting for photos ·
                  Flatten multi-page EOBs to one image per page · After extraction, review the text before running
                </div>
              </div>
            )}

            {/* ── TEXT MODE (default) or non-RCM ── */}
            {(!activeTool.startsWith("rcm") || activeTool !== "rcm" || rcmInputTab === "text") &&
             !(activeTool === "rcm" && (rcmInputTab === "form" || rcmInputTab === "scan")) && (
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:11, color:T.textMuted, textTransform:"uppercase", letterSpacing:"1.2px", fontWeight:600 }}>{cfg.label}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    {/* FHIR/HL7 normalize button */}
                    {(activeTool === "fhir" || activeTool === "rcm") && inputVal && looksLikeFhirHl7(inputVal) && (
                      <button className="norm-btn" disabled={normalizing} onClick={normalizeInput}>
                        {normalizing ? <span className="spin">⚙️</span> : "🔧"} Normalize HL7/FHIR
                      </button>
                    )}
                    <button className="dt-copy-btn" onClick={() => setInput("")} style={{ fontSize:10 }}>Clear</button>
                    <button className="dt-copy-btn" onClick={() => fileInputRef.current?.click()} style={{ fontSize:10 }}>📁 Load File</button>
                  </div>
                </div>
                <textarea className="dt-textarea" rows={cfg.rows || 14}
                  placeholder={activePlaceholder}
                  value={inputVal}
                  onChange={e => setInput(e.target.value)}
                  style={{ flex:1, minHeight: (cfg.rows || 14) * 22 }}
                />
              </div>
            )}

            <button className="dt-run-btn" onClick={run}
              disabled={isRunning || (
                activeTool === "rcm" && rcmInputTab === "form"
                  ? !assembleFormInput(activeMode, rcmFormData[activeMode] || {}).trim()
                  : !inputVal.trim()
              )}>
              {isRunning ? <><span className="spin">⚡</span> Analyzing...</> : `${tool.icon} Run ${tool.label}`}
            </button>

            <input ref={fileInputRef} type="file" style={{ display:"none" }}
              onChange={async e => { await handleSmartFile(e.target.files?.[0]); e.target.value=""; }} />
          </div>

          {/* Result pane */}
          <div style={{ flex:1, overflowY:"auto", padding:20 }}>

            {/* ── RCM idle state ── */}
            {activeTool === "rcm" && !resultVal && !isRunning && !errVal && (
              <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, opacity:0.25 }}>
                <div style={{ fontSize:56 }}>💊</div>
                <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:20, fontWeight:800, color:T.text }}>RCM Autonomous</div>
                <div style={{ fontSize:13, color:T.textSub, textAlign:"center", maxWidth:280, lineHeight:1.7 }}>
                  Paste, scan, or fill the form — then run your analysis
                </div>
              </div>
            )}

            {/* ── Other tools: generic idle state ── */}
            {activeTool !== "rcm" && !resultVal && !isRunning && !errVal && (
              <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, opacity:0.25 }}>
                <div style={{ fontSize:56 }}>{tool.icon}</div>
                <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:20, fontWeight:800, color:T.text }}>
                  {tool.label}
                </div>
                <div style={{ fontSize:13, color:T.textSub, textAlign:"center", maxWidth:280, lineHeight:1.7 }}>
                  {activePlaceholder.slice(0, 80)}...
                </div>
              </div>
            )}

            {isRunning && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:"80px 20px" }}>
                <div style={{ width:52, height:52, border:"3px solid " + T.border, borderTopColor:tool.color, borderRadius:"50%" }} className="spin" />
                <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:15, fontWeight:700, color:T.text }}>
                  Analyzing with AI...
                </div>
                <div style={{ fontSize:12, color:T.textMuted }}>This usually takes 5–15 seconds</div>
              </div>
            )}

            {errVal && (
              <div style={{ background: isDark?"rgba(248,113,113,0.08)":"rgba(254,202,202,0.4)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:12, padding:"14px 18px", color:"#f87171", fontSize:13 }}>
                ⚠️ {errVal}
              </div>
            )}

            {resultVal && !isRunning && (
              <div style={{ lineHeight:1.7 }}>
                {fmt(resultVal)}
              </div>
            )}
          </div>
        </div>
      </div>
      <HelpPanel tab="devtools" tool={activeTool} isDark={isDark} />
    </div>
  );
}