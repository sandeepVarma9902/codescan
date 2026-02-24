#!/usr/bin/env node
/**
 * apps/cli/src/cli.js
 * CodeScan CLI
 * 
 * Usage:
 *   codescan review myfile.py
 *   codescan review src/auth.js --standards solid,owasp --mode cloud
 *   codescan review . --ext .py,.js   (review all matching files in dir)
 * 
 * Uses the SAME @codescan/core as the web and desktop apps.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import { reviewCode, detectLanguageFromExt, STANDARDS, LANGUAGE_LABELS } from "@codescan/core";

const program = new Command();

// ── Helpers ───────────────────────────────────────────────────────────────────

function printBanner() {
  console.log(chalk.cyan("\n⚡ CodeScan CLI") + chalk.gray(" — AI Code Review Engine"));
  console.log(chalk.gray("─".repeat(50)));
}

function severityColor(sev) {
  if (sev === "Critical")   return chalk.red(sev);
  if (sev === "Warning")    return chalk.yellow(sev);
  if (sev === "Suggestion") return chalk.blue(sev);
  return chalk.white(sev);
}

function printResult(result, filePath) {
  const scoreColor = result.score >= 80 ? chalk.green : result.score >= 60 ? chalk.yellow : chalk.red;
  
  console.log("\n" + chalk.bold(filePath));
  console.log(chalk.gray("─".repeat(50)));
  console.log(`Score: ${scoreColor(`${result.score}/100`)}  Engine: ${chalk.gray(result.engine)}`);
  console.log(chalk.gray(result.summary) + "\n");

  if (result.strengths?.length) {
    console.log(chalk.green("✓ Strengths"));
    result.strengths.forEach(s => console.log(chalk.green(`  · ${s}`)));
    console.log();
  }

  if (result.issues?.length === 0) {
    console.log(chalk.green("🎉 No issues found!\n"));
    return;
  }

  const criticals   = result.issues.filter(i => i.severity === "Critical");
  const warnings    = result.issues.filter(i => i.severity === "Warning");
  const suggestions = result.issues.filter(i => i.severity === "Suggestion");

  console.log(
    `Issues: ${chalk.red(criticals.length + " Critical")}  ` +
    `${chalk.yellow(warnings.length + " Warning")}  ` +
    `${chalk.blue(suggestions.length + " Suggestion")}\n`
  );

  for (const issue of result.issues) {
    console.log(`  ${severityColor(issue.severity)} ${chalk.bold(issue.title)} ${chalk.gray(issue.line_reference)}`);
    console.log(`  ${chalk.gray(issue.problem)}`);
    if (issue.improved_code) {
      console.log(chalk.cyan("  Fix:"));
      issue.improved_code.split("\n").forEach(l => console.log(chalk.cyan("    " + l)));
    }
    console.log();
  }
}

function printJSON(result) {
  console.log(JSON.stringify(result, null, 2));
}

function getFilesToReview(target, extFilter) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];

  // Directory: walk and filter
  const results = [];
  const allowed = extFilter ? extFilter.split(",") : [".js",".ts",".py",".java",".go",".rs",".cpp",".cs",".rb",".php",".swift",".kt"];
  
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const full = path.join(dir, entry);
      const s = fs.statSync(full);
      if (s.isDirectory()) walk(full);
      else if (allowed.includes(path.extname(full))) results.push(full);
    }
  }
  walk(target);
  return results;
}

// ── Commands ──────────────────────────────────────────────────────────────────

program
  .name("codescan")
  .description("AI-powered code review — supports 40+ languages")
  .version("1.0.0");

program
  .command("review <path>")
  .description("Review a file or directory")
  .option("-l, --language <lang>",        "Language (auto-detected if omitted)")
  .option("-s, --standards <ids>",        "Comma-separated standard IDs", "solid,null_safety,error_handling,clean_code")
  .option("-m, --mode <mode>",            "Engine mode: auto|cloud|local", "auto")
  .option("-k, --api-key <key>",          "Anthropic API key (or set ANTHROPIC_API_KEY env var)")
  .option("--model <model>",              "Local Ollama model", "deepseek-coder")
  .option("--ext <extensions>",           "File extensions to scan in directory (e.g. .py,.js)")
  .option("--json",                       "Output raw JSON")
  .option("--fail-under <score>",         "Exit with code 1 if score is below this value")
  .action(async (target, opts) => {
    printBanner();

    const files = getFilesToReview(target, opts.ext);
    if (!files.length) {
      console.error(chalk.red("No files found to review."));
      process.exit(1);
    }

    const standards = opts.standards.split(",").map(s => s.trim());
    const unknownStandards = standards.filter(s => !STANDARDS.find(st => st.id === s));
    if (unknownStandards.length) {
      console.warn(chalk.yellow(`Unknown standards: ${unknownStandards.join(", ")}`));
      console.warn(chalk.gray(`Available: ${STANDARDS.map(s => s.id).join(", ")}\n`));
    }

    let exitCode = 0;

    for (const file of files) {
      const code = fs.readFileSync(file, "utf-8");
      const langObj = detectLanguageFromExt(file);
      const language = opts.language || langObj?.label || "Unknown";

      if (language === "Unknown") {
        console.warn(chalk.yellow(`⚠ Could not detect language for ${file}, skipping`));
        continue;
      }

      const spinner = ora(`Reviewing ${chalk.cyan(path.basename(file))} (${language})...`).start();

      try {
        const result = await reviewCode(
          { code, language, standards },
          {
            mode: opts.mode,
            apiKey: opts.apiKey || process.env.ANTHROPIC_API_KEY,
            localModel: opts.model,
            onStatus: (msg) => { spinner.text = msg; }
          }
        );

        spinner.succeed(`${path.basename(file)} — Score: ${result.score}/100`);

        if (opts.json) {
          printJSON(result);
        } else {
          printResult(result, file);
        }

        // Fail under check
        if (opts.failUnder && result.score < parseInt(opts.failUnder)) {
          exitCode = 1;
        }

      } catch (e) {
        spinner.fail(`Failed: ${e.message}`);
        exitCode = 1;
      }
    }

    process.exit(exitCode);
  });

program
  .command("standards")
  .description("List all available review standards")
  .action(() => {
    printBanner();
    console.log(chalk.bold("\nAvailable Standards:\n"));
    STANDARDS.forEach(s => {
      console.log(`  ${s.icon} ${chalk.cyan(s.id.padEnd(20))} ${s.label}`);
      console.log(chalk.gray(`     ${s.description}\n`));
    });
  });

program
  .command("languages")
  .description("List all supported languages")
  .action(() => {
    printBanner();
    console.log(chalk.bold("\nSupported Languages:\n"));
    LANGUAGE_LABELS.forEach(l => console.log(`  · ${chalk.cyan(l)}`));
    console.log();
  });

program.parse();
