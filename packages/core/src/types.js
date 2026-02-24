/**
 * @codescan/core — types.js
 * Shared type definitions used across all apps.
 * In a TypeScript project these would be .d.ts interfaces.
 */

/**
 * ReviewRequest — what you send in
 * {
 *   code: string,
 *   language: string,        // e.g. "Python", "JavaScript"
 *   standards: string[],     // e.g. ["solid", "owasp"]
 *   customRules?: string,    // optional free-text custom rules
 * }
 */

/**
 * ReviewIssue — a single problem found
 * {
 *   id: number,
 *   severity: "Critical" | "Warning" | "Suggestion",
 *   category: string,
 *   line_reference: string,
 *   title: string,
 *   problem: string,
 *   improved_code: string,
 *   explanation: string,
 * }
 */

/**
 * ReviewResult — full response
 * {
 *   score: number,           // 0–100
 *   summary: string,
 *   issues: ReviewIssue[],
 *   strengths: string[],
 *   language: string,
 *   standards: string[],
 *   reviewedAt: string,      // ISO timestamp
 *   engine: "cloud" | "local"
 * }
 */

export const SEVERITY = {
  CRITICAL: "Critical",
  WARNING: "Warning",
  SUGGESTION: "Suggestion",
};

export const ENGINE = {
  CLOUD: "cloud",
  LOCAL: "local",
};
