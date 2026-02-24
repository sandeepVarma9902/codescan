/**
 * @codescan/core — index.js
 * Single entry point. Import anything from here.
 * 
 * Usage:
 *   import { reviewCode, STANDARDS, LANGUAGES } from "@codescan/core"
 */

export { reviewCode, checkOnlineStatus, CLOUD_CONFIG, LOCAL_CONFIG } from "./reviewer.js";
export { STANDARDS, getStandard, buildStandardsPrompt } from "./standards.js";
export { LANGUAGES, LANGUAGE_LABELS, detectLanguageFromExt, getLanguageGroups } from "./languages.js";
export { SEVERITY, ENGINE } from "./types.js";
