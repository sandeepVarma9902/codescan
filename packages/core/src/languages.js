/**
 * @codescan/core — languages.js
 * Master list of all supported languages.
 * Used by web dropdown, CLI --language flag, VS Code language detection.
 */

export const LANGUAGES = [
  // Web / Frontend
  { id: "javascript",  label: "JavaScript",    group: "Web",       ext: [".js", ".mjs", ".cjs"] },
  { id: "typescript",  label: "TypeScript",    group: "Web",       ext: [".ts", ".tsx"] },
  { id: "html_css",    label: "HTML / CSS",    group: "Web",       ext: [".html", ".css", ".scss", ".sass"] },
  { id: "jsx",         label: "React (JSX)",   group: "Web",       ext: [".jsx"] },
  { id: "vue",         label: "Vue",           group: "Web",       ext: [".vue"] },
  { id: "svelte",      label: "Svelte",        group: "Web",       ext: [".svelte"] },

  // Backend
  { id: "python",      label: "Python",        group: "Backend",   ext: [".py"] },
  { id: "java",        label: "Java",          group: "Backend",   ext: [".java"] },
  { id: "csharp",      label: "C#",            group: "Backend",   ext: [".cs"] },
  { id: "go",          label: "Go",            group: "Backend",   ext: [".go"] },
  { id: "rust",        label: "Rust",          group: "Backend",   ext: [".rs"] },
  { id: "ruby",        label: "Ruby",          group: "Backend",   ext: [".rb"] },
  { id: "php",         label: "PHP",           group: "Backend",   ext: [".php"] },
  { id: "kotlin",      label: "Kotlin",        group: "Backend",   ext: [".kt", ".kts"] },
  { id: "scala",       label: "Scala",         group: "Backend",   ext: [".scala"] },
  { id: "elixir",      label: "Elixir",        group: "Backend",   ext: [".ex", ".exs"] },
  { id: "haskell",     label: "Haskell",       group: "Backend",   ext: [".hs"] },
  { id: "clojure",     label: "Clojure",       group: "Backend",   ext: [".clj", ".cljs"] },
  { id: "erlang",      label: "Erlang",        group: "Backend",   ext: [".erl"] },
  { id: "fsharp",      label: "F#",            group: "Backend",   ext: [".fs", ".fsi"] },

  // Systems
  { id: "c",           label: "C",             group: "Systems",   ext: [".c", ".h"] },
  { id: "cpp",         label: "C++",           group: "Systems",   ext: [".cpp", ".cc", ".cxx", ".hpp"] },
  { id: "swift",       label: "Swift",         group: "Systems",   ext: [".swift"] },
  { id: "dart",        label: "Dart",          group: "Mobile",    ext: [".dart"] },
  { id: "assembly",    label: "Assembly",      group: "Systems",   ext: [".asm", ".s"] },
  { id: "zig",         label: "Zig",           group: "Systems",   ext: [".zig"] },

  // Data / ML
  { id: "r",           label: "R",             group: "Data/ML",   ext: [".r", ".R"] },
  { id: "matlab",      label: "MATLAB",        group: "Data/ML",   ext: [".m"] },
  { id: "julia",       label: "Julia",         group: "Data/ML",   ext: [".jl"] },

  // Data / Query
  { id: "sql",         label: "SQL",           group: "Data",      ext: [".sql"] },
  { id: "graphql",     label: "GraphQL",       group: "Data",      ext: [".graphql", ".gql"] },

  // Scripting / DevOps
  { id: "bash",        label: "Shell / Bash",  group: "DevOps",    ext: [".sh", ".bash"] },
  { id: "powershell",  label: "PowerShell",    group: "DevOps",    ext: [".ps1", ".psm1"] },
  { id: "lua",         label: "Lua",           group: "Scripting", ext: [".lua"] },
  { id: "perl",        label: "Perl",          group: "Scripting", ext: [".pl", ".pm"] },
  { id: "groovy",      label: "Groovy",        group: "DevOps",    ext: [".groovy", ".gradle"] },

  // Config / Infra
  { id: "yaml",        label: "YAML",          group: "Config",    ext: [".yaml", ".yml"] },
  { id: "json",        label: "JSON",          group: "Config",    ext: [".json"] },
  { id: "toml",        label: "TOML",          group: "Config",    ext: [".toml"] },
  { id: "dockerfile",  label: "Dockerfile",    group: "DevOps",    ext: ["Dockerfile"] },
  { id: "terraform",   label: "Terraform",     group: "DevOps",    ext: [".tf"] },

  // Web3 / Blockchain
  { id: "solidity",    label: "Solidity",      group: "Web3",      ext: [".sol"] },
  { id: "vyper",       label: "Vyper",         group: "Web3",      ext: [".vy"] },
  { id: "move",        label: "Move",          group: "Web3",      ext: [".move"] },
];

/** Get language config by file extension */
export function detectLanguageFromExt(filename) {
  const ext = "." + filename.split(".").pop().toLowerCase();
  const base = filename.split("/").pop(); // for Dockerfile etc.
  return LANGUAGES.find(l =>
    l.ext.includes(ext) || l.ext.includes(base)
  ) || null;
}

/** Group languages for dropdown display */
export function getLanguageGroups() {
  const groups = {};
  for (const lang of LANGUAGES) {
    if (!groups[lang.group]) groups[lang.group] = [];
    groups[lang.group].push(lang);
  }
  return groups;
}

/** Get just the label strings (for simple dropdowns) */
export const LANGUAGE_LABELS = LANGUAGES.map(l => l.label);
