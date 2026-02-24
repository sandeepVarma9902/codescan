# ⚡ CodeScan — AI Code Review Engine

> Review code against industry standards. Runs everywhere. Works offline.

---

## What Is This?

CodeScan is an AI-powered code review tool that supports **40+ programming languages** and checks code against standards like SOLID, OWASP, Clean Code, and more.

It's built as a **monorepo** — one codebase that powers:

| App | Description |
|-----|-------------|
| 🌐 `apps/web` | Web app — deploy to Vercel, Netlify, etc. |
| 🖥️ `apps/desktop` | Desktop app — Windows, macOS, Linux (Electron) |
| 📱 `apps/mobile` | iOS & Android app (Capacitor) |
| 🧩 `apps/vscode` | VS Code extension |
| ⌨️ `apps/cli` | Terminal CLI tool |

All apps share:
- `packages/core` — the AI review engine (online + offline)
- `packages/ui` — shared React components

---

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Turborepo (`npm install -g turbo`)

```bash
git clone https://github.com/yourname/codescan
cd codescan
pnpm install
```

### Run the web app
```bash
pnpm dev:web
# Opens at http://localhost:5173
```

### Run the desktop app
```bash
pnpm dev:desktop
# Opens as a native desktop window
```

### Use the CLI
```bash
# Install globally
cd apps/cli && npm link

# Review a file
codescan review myfile.py

# Review with specific standards
codescan review src/auth.js --standards solid,owasp,null_safety

# Review entire directory
codescan review ./src --ext .js,.ts

# Fail CI if score drops below 70
codescan review src/ --fail-under 70
```

---

## Online vs Offline Mode

CodeScan works in **3 modes**, set via the UI toggle or `--mode` CLI flag:

| Mode | How it works |
|------|-------------|
| `auto` | Checks internet → uses Claude API if online, Ollama if offline |
| `cloud` | Always uses Anthropic Claude API (requires API key) |
| `local` | Always uses local Ollama model (no internet needed) |

### Setting up offline mode (Ollama)
```bash
# 1. Install Ollama
brew install ollama         # macOS
# or download from https://ollama.ai

# 2. Pull a code model
ollama pull deepseek-coder  # recommended
# or: ollama pull codellama
# or: ollama pull codegemma

# 3. Start Ollama server
ollama serve

# 4. Run CodeScan in local mode
codescan review myfile.py --mode local
```

---

## Setting Your API Key

For cloud mode (Anthropic Claude):

```bash
# Option 1: Environment variable (recommended)
export ANTHROPIC_API_KEY=sk-ant-...

# Option 2: In the web/desktop UI (Settings panel)
# Option 3: CLI flag
codescan review myfile.py --api-key sk-ant-...

# Option 4: VS Code settings
# Settings → Extensions → CodeScan → API Key
```

---

## Available Standards

| ID | Standard |
|----|----------|
| `solid` | SOLID Principles |
| `dry` | DRY / KISS / YAGNI |
| `clean_code` | Clean Code (Uncle Bob) |
| `owasp` | OWASP Security Top 10 |
| `null_safety` | Null Safety & Edge Cases |
| `error_handling` | Error Handling |
| `performance` | Performance Optimization |
| `design_patterns` | Design Patterns |
| `naming` | Naming Conventions |
| `complexity` | Cyclomatic Complexity |
| `testing` | Testability |
| `docs` | Documentation & Comments |

```bash
# List all standards
codescan standards
```

---

## Project Structure

```
codescan/
├── packages/
│   ├── core/           ← AI engine, standards, language defs
│   └── ui/             ← Shared React components
├── apps/
│   ├── web/            ← Vite + React web app
│   ├── desktop/        ← Electron wrapper
│   ├── mobile/         ← Capacitor (iOS + Android)
│   ├── vscode/         ← VS Code extension
│   └── cli/            ← Terminal tool
├── package.json        ← pnpm workspaces root
├── turbo.json          ← Turborepo pipeline
└── pnpm-workspace.yaml
```

---

## Build for Production

```bash
# Build everything
pnpm build

# Build specific apps
pnpm build:web        # → apps/web/dist/
pnpm build:desktop    # → apps/desktop/release/ (.exe/.dmg/.AppImage)
pnpm build:mobile     # → then: cap open ios / cap open android
pnpm build:vscode     # → apps/vscode/*.vsix
```

---

## Supported Languages (40+)

Python, JavaScript, TypeScript, Java, C#, C, C++, Go, Rust, Ruby, PHP,
Swift, Kotlin, Scala, R, MATLAB, Julia, Dart, Elixir, Haskell, Lua, Perl,
Groovy, SQL, GraphQL, HTML/CSS, JSX, Vue, Svelte, Shell/Bash, PowerShell,
YAML, JSON, TOML, Dockerfile, Terraform, Solidity, Vyper, Move, Zig, Assembly

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes in `packages/core` or `packages/ui` — they'll apply to all apps
4. Test: `pnpm test`
5. PR it!

---

## License

MIT
