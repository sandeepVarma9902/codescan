/**
 * apps/vscode/src/extension.js
 * CodeScan VS Code Extension
 * 
 * Adds:
 *  - Right-click → "CodeScan: Review This File"
 *  - Right-click on selection → "CodeScan: Review Selected Code"
 *  - Results shown in a VS Code WebView panel
 *
 * Uses @codescan/core — same engine as web, desktop, and CLI.
 */

const vscode = require("vscode");
const { reviewCode, detectLanguageFromExt, STANDARDS } = require("@codescan/core");

// ── Language detection from VS Code's languageId ──────────────────────────────

const VSCODE_LANG_MAP = {
  javascript: "JavaScript", typescript: "TypeScript", python: "Python",
  java: "Java", csharp: "C#", cpp: "C++", c: "C", go: "Go", rust: "Rust",
  ruby: "Ruby", php: "PHP", swift: "Swift", kotlin: "Kotlin", scala: "Scala",
  shellscript: "Shell / Bash", powershell: "PowerShell", lua: "Lua",
  r: "R", sql: "SQL", yaml: "YAML", dockerfile: "Dockerfile",
  solidity: "Solidity", dart: "Dart", elixir: "Elixir", haskell: "Haskell",
  vue: "Vue", svelte: "Svelte", graphql: "GraphQL",
};

function getLanguage(doc) {
  return VSCODE_LANG_MAP[doc.languageId]
    || detectLanguageFromExt(doc.fileName)?.label
    || "Unknown";
}

// ── Results WebView ───────────────────────────────────────────────────────────

function createResultsPanel(context, result, language) {
  const panel = vscode.window.createWebviewPanel(
    "codescanResults",
    `CodeScan — ${language} (${result.score}/100)`,
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  const scoreColor = result.score >= 80 ? "#4ade80" : result.score >= 60 ? "#ffb347" : "#ff4d4d";
  const sevColors = { Critical: "#ff4d4d", Warning: "#ffb347", Suggestion: "#4db8ff" };
  const sevBg     = { Critical: "rgba(255,77,77,0.08)", Warning: "rgba(255,179,71,0.08)", Suggestion: "rgba(77,184,255,0.08)" };
  const dots      = { Critical: "🔴", Warning: "🟡", Suggestion: "🔵" };

  const issueHTML = (result.issues || []).map(issue => `
    <div class="issue" style="border:1px solid ${sevBg[issue.severity]};margin-bottom:10px;border-radius:6px;">
      <div style="padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
          <span style="color:${sevColors[issue.severity]};font-size:11px;font-weight:700">${dots[issue.severity]} ${issue.severity}</span>
          <span style="color:#555;font-size:10px">${issue.category}</span>
          <span style="color:#333;font-size:10px;margin-left:auto">${issue.line_reference}</span>
        </div>
        <div style="font-size:13px;font-weight:600;color:#d1d5db;margin-bottom:4px">${issue.title}</div>
        <div style="font-size:11px;color:#666;line-height:1.5">${issue.problem}</div>
        ${issue.improved_code ? `
          <div style="margin-top:10px;font-size:10px;color:#4db8ff;margin-bottom:4px">📌 IMPROVED CODE</div>
          <pre style="background:#0d1117;border-left:3px solid #4db8ff;padding:10px;font-size:11px;color:#c9d1d9;border-radius:4px;white-space:pre-wrap;word-break:break-all;margin:0">${issue.improved_code.replace(/</g,"&lt;")}</pre>
        ` : ""}
        ${issue.explanation ? `<div style="margin-top:8px;font-size:11px;color:#6ee7a0;line-height:1.5">💡 ${issue.explanation}</div>` : ""}
      </div>
    </div>
  `).join("");

  const strengthsHTML = (result.strengths || []).map(s =>
    `<div style="font-size:12px;color:#6ee7a0;margin-bottom:3px;padding-left:8px">· ${s}</div>`
  ).join("");

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
    body { background:#0a0a0f; color:#e2e8f0; font-family:'JetBrains Mono',monospace; padding:20px; margin:0; }
    * { box-sizing:border-box; }
    ::-webkit-scrollbar { width:5px; } ::-webkit-scrollbar-track { background:#111; }
    ::-webkit-scrollbar-thumb { background:#2a2a3a; border-radius:3px; }
  </style>
</head>
<body>
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #1a1a2e">
    <div style="font-size:32px;font-weight:800;color:${scoreColor}">${result.score}</div>
    <div>
      <div style="font-size:14px;font-weight:700;color:${scoreColor}">${result.score>=80?"✅ Solid Code":result.score>=60?"⚠️ Needs Work":"🔴 Critical Issues"}</div>
      <div style="font-size:11px;color:#666;margin-top:3px">${language} · ${result.engine} · ${(result.issues||[]).length} issues</div>
    </div>
  </div>
  <div style="font-size:12px;color:#888;line-height:1.6;margin-bottom:16px">${result.summary}</div>
  ${strengthsHTML ? `
    <div style="background:rgba(74,222,128,0.05);border:1px solid rgba(74,222,128,0.15);border-radius:6px;padding:12px;margin-bottom:16px">
      <div style="font-size:10px;color:#4ade80;letter-spacing:1.5px;margin-bottom:8px;font-weight:600">✓ STRENGTHS</div>
      ${strengthsHTML}
    </div>` : ""}
  <div style="font-size:10px;color:#555;letter-spacing:1.5px;margin-bottom:10px">ISSUES · ${(result.issues||[]).length} FOUND</div>
  ${issueHTML || '<div style="color:#4ade80;font-size:13px">🎉 No issues found!</div>'}
</body>
</html>`;

  return panel;
}

// ── Main review function ──────────────────────────────────────────────────────

async function runReview(code, language, context) {
  const config = vscode.workspace.getConfiguration("codescan");
  const standards = config.get("standards") || ["solid", "null_safety", "error_handling", "clean_code"];
  const mode      = config.get("mode") || "auto";
  const apiKey    = config.get("apiKey") || process.env.ANTHROPIC_API_KEY;
  const localModel= config.get("localModel") || "deepseek-coder";

  return await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "CodeScan", cancellable: false },
    async (progress) => {
      progress.report({ message: `Reviewing ${language} code...` });
      return await reviewCode(
        { code, language, standards },
        { mode, apiKey, localModel, onStatus: (msg) => progress.report({ message: msg }) }
      );
    }
  );
}

// ── Extension Activation ──────────────────────────────────────────────────────

function activate(context) {
  // Command: Review entire file
  context.subscriptions.push(
    vscode.commands.registerCommand("codescan.reviewFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showWarningMessage("No active editor");

      const code     = editor.document.getText();
      const language = getLanguage(editor.document);

      if (language === "Unknown") {
        return vscode.window.showWarningMessage("CodeScan: Could not detect language for this file.");
      }

      try {
        const result = await runReview(code, language, context);
        createResultsPanel(context, result, language);
      } catch (e) {
        vscode.window.showErrorMessage(`CodeScan error: ${e.message}`);
      }
    })
  );

  // Command: Review selection
  context.subscriptions.push(
    vscode.commands.registerCommand("codescan.reviewSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showWarningMessage("No active editor");

      const selection = editor.selection;
      if (selection.isEmpty) return vscode.window.showWarningMessage("No code selected");

      const code     = editor.document.getText(selection);
      const language = getLanguage(editor.document);

      try {
        const result = await runReview(code, language, context);
        createResultsPanel(context, result, language);
      } catch (e) {
        vscode.window.showErrorMessage(`CodeScan error: ${e.message}`);
      }
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
