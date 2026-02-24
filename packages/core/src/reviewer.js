/**
 * @codescan/core — reviewer.js
 * Supports: Groq (free) + Anthropic (paid) via proxy, and Ollama (offline)
 */

import { buildStandardsPrompt } from "./standards.js";

const CLOUD_CONFIG = {
  url: "https://codescan-server.onrender.com/api/review",
  model: "llama-3.3-70b-versatile",
  maxTokens: 4000,
};

const LOCAL_CONFIG = {
  url: "http://localhost:11434/api/generate",
  model: "llama3.1:8b",
};

// ─── Connectivity Check ───────────────────────────────────────────────────────

export async function checkOnlineStatus() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("http://localhost:3001/health", { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPrompt(code, language, standardIds, customRules = "") {
  const standardsSection = buildStandardsPrompt(standardIds);
  const customSection = customRules ? `### Custom Team Rules\n${customRules}\n\n` : "";

  return `You are a world-class senior software engineer and code reviewer.
Review the following ${language} code with deep expertise.

${standardsSection}

${customSection}Return ONLY a valid JSON object — no markdown, no explanation, no text outside the JSON.

{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "issues": [
    {
      "id": 1,
      "severity": "<Critical|Warning|Suggestion>",
      "category": "<standard name>",
      "line_reference": "<e.g. Line 5>",
      "title": "<short issue title>",
      "problem": "<what is wrong and why it matters>",
      "improved_code": "<corrected code snippet>",
      "explanation": "<why the fix is better>"
    }
  ],
  "strengths": ["<something done well>"]
}

Severity: Critical=security/crashes/null-errors, Warning=bad practices/performance, Suggestion=style/naming.

Code (${language}):
\`\`\`
${code}
\`\`\``;
}

function buildLocalPrompt(code, language, standardIds) {
  const standards = standardIds.join(", ");
  return `Review this ${language} code for: ${standards}.

CODE:
${code}

Respond with ONLY a JSON object. No explanation. No markdown. No text before or after. Double quotes only.

Example:
{"score":60,"summary":"Code has security and null safety issues.","issues":[{"id":1,"severity":"Critical","category":"Security","line_reference":"Line 2","title":"SQL Injection Risk","problem":"User input directly used in SQL string.","improved_code":"db.query('SELECT * FROM users WHERE id = ?', [userId])","explanation":"Parameterized queries prevent SQL injection."}],"strengths":["Clear variable names"]}

Your JSON:`;
}

// ─── Cloud Review (Groq or Anthropic via proxy) ───────────────────────────────

async function reviewWithCloud(code, language, standardIds, customRules) {
  const prompt = buildPrompt(code, language, standardIds, customRules);

  const response = await fetch(CLOUD_CONFIG.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CLOUD_CONFIG.model,
      max_tokens: CLOUD_CONFIG.maxTokens,
      // Send as messages array — works for both Groq and Anthropic via proxy
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`API error ${response.status}: ${err?.error?.message || JSON.stringify(err)}`);
  }

  const data = await response.json();
  const text = data.content?.map(c => c.text || "").join("") || "";
  return parseReviewResponse(text);
}

// ─── Local Review (Ollama) ────────────────────────────────────────────────────

async function reviewWithOllama(code, language, standardIds, model = LOCAL_CONFIG.model) {
  const prompt = buildLocalPrompt(code, language, standardIds);

  const response = await fetch(LOCAL_CONFIG.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0.1, num_predict: 2000 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}. Is Ollama running? Run: ollama serve`);
  }

  const data = await response.json();
  return parseReviewResponse(data.response || "");
}

// ─── Response Parser ──────────────────────────────────────────────────────────

function sanitizeJson(str) {
  return str
    .replace(/```json\s*/gi, "").replace(/```\s*/g, "")
    .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([\]}])/g, "$1")
    .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^']*)'/g, ': "$1"')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

function parseReviewResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallbackResult("Model did not return JSON. Try again.");

  const jsonStr = jsonMatch[0];
  try { return validateAndReturn(JSON.parse(jsonStr)); } catch (_) {}
  try { return validateAndReturn(JSON.parse(sanitizeJson(jsonStr))); } catch (_) {}

  try {
    const score = jsonStr.match(/"score"\s*:\s*(\d+)/)?.[1];
    const summary = jsonStr.match(/"summary"\s*:\s*"([^"]+)"/)?.[1];
    if (score) return { score: parseInt(score), summary: summary || "Partial result.", issues: [], strengths: [] };
  } catch (_) {}

  return fallbackResult("Could not parse model response. Try again.");
}

function validateAndReturn(parsed) {
  return {
    score:     typeof parsed.score === "number" ? Math.min(100, Math.max(0, parsed.score)) : 50,
    summary:   typeof parsed.summary === "string" ? parsed.summary : "Review complete.",
    issues:    Array.isArray(parsed.issues) ? parsed.issues : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
  };
}

function fallbackResult(message) {
  return { score: 50, summary: message, issues: [], strengths: [] };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function reviewCode(request, options = {}) {
  const { mode = "auto", localModel = LOCAL_CONFIG.model, onStatus = () => {} } = options;
  const { code, language, standards, customRules = "" } = request;

  if (!code?.trim())      throw new Error("No code provided");
  if (!language)          throw new Error("No language specified");
  if (!standards?.length) throw new Error("No standards selected");

  let engine = mode;

  if (mode === "auto") {
    onStatus("Checking proxy server...");
    const proxyUp = await checkOnlineStatus();
    engine = proxyUp ? "cloud" : "local";
    onStatus(proxyUp ? "Using cloud AI (Groq/Claude)..." : "Proxy offline — using local AI...");
  } else {
    onStatus(mode === "cloud" ? "Connecting to cloud AI..." : "Using local AI (Ollama)...");
  }

  const result = engine === "cloud"
    ? await reviewWithCloud(code, language, standards, customRules)
    : await reviewWithOllama(code, language, standards, localModel);

  return { ...result, language, standards, reviewedAt: new Date().toISOString(), engine };
}

export { CLOUD_CONFIG, LOCAL_CONFIG };