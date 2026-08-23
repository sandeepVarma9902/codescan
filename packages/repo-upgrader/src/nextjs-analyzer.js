export function analyzeNextReadiness(sourceRecords, dependencies = {}) {
  const routes = [];
  const findings = [];
  const clientBoundaries = [];
  const dataFetching = [];

  for (const { file, content } of sourceRecords) {
    const reasons = [];
    for (const match of content.matchAll(/<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["'][^>]*(?:\belement\s*=\s*\{\s*<([A-Za-z0-9_$.]+))?/g)) {
      routes.push({ sourceFile: file, path: match[1], component: match[2] || null, destination: appRouterDestination(match[1]) });
    }
    if (/\bHashRouter\b/.test(content)) findings.push(finding('hash-router', 'blocker', file, 'HashRouter URL semantics require an explicit product decision before App Router migration.'));
    if (/\bBrowserRouter\b|\bRoutes\b|\buseNavigate\b|\buseLocation\b/.test(content)) reasons.push('client-side routing');
    const browserApis = [...new Set(content.match(/\b(?:window|document|localStorage|sessionStorage|navigator)\b/g) || [])];
    if (browserApis.length) { reasons.push(`browser APIs: ${browserApis.join(', ')}`); findings.push(finding('browser-api', 'warning', file, `Browser-only APIs require a client component or guarded access: ${browserApis.join(', ')}.`)); }
    const hooks = [...new Set(content.match(/\b(?:useState|useEffect|useLayoutEffect|useReducer|useRef)\b/g) || [])];
    if (hooks.length) reasons.push(`React hooks: ${hooks.join(', ')}`);
    if (/useEffect\s*\([^)]*(?:fetch\s*\(|axios\.)/s.test(content) || (/useEffect\s*\(/.test(content) && /\b(?:fetch\s*\(|axios\.)/.test(content))) {
      dataFetching.push({ file, pattern: 'effect-fetch', recommendation: 'Evaluate moving this request to an async Server Component or route handler.' });
      findings.push(finding('client-data-fetching', 'warning', file, 'Effect-based data fetching may cause client waterfalls and should be reviewed for server execution.'));
    }
    if (/\.css["'];?\s*$/m.test(content) && !/(?:index|main|App)\.[jt]sx?$/.test(file)) findings.push(finding('global-css-import', 'warning', file, 'Global CSS imports must move to the root layout or become CSS Modules.'));
    if (reasons.length) clientBoundaries.push({ file, reasons });
  }

  if (dependencies['react-router-dom'] && routes.length === 0) findings.push(finding('dynamic-routes', 'warning', 'src/', 'React Router is installed but static route declarations were not found; routes may be data-driven.'));
  const uniqueRoutes = dedupe(routes, (route) => `${route.path}:${route.sourceFile}`);
  const blockers = findings.filter((item) => item.severity === 'blocker').length;
  const warnings = findings.filter((item) => item.severity === 'warning').length;
  const score = Math.max(0, 100 - blockers * 30 - warnings * 7 - (uniqueRoutes.length === 0 ? 10 : 0));
  return {
    schemaVersion: 1,
    readiness: { score, level: blockers ? 'blocked' : score >= 90 ? 'high' : score >= 55 ? 'medium' : 'low', blockers, warnings },
    router: dependencies['react-router-dom'] ? 'react-router' : 'unknown',
    routes: uniqueRoutes,
    clientBoundaries: dedupe(clientBoundaries, (item) => item.file),
    dataFetching,
    findings,
    gates: ['route mapping approved', 'client/server boundaries reviewed', 'data-fetching strategy approved', 'behavioral tests available']
  };
}

export function appRouterDestination(routePath) {
  if (routePath === '/' || routePath === '') return 'app/page';
  const segments = routePath.split('/').filter(Boolean).map((segment) => {
    if (segment === '*') return '[[...slug]]';
    if (segment.startsWith(':')) return `[${segment.slice(1).replace(/\?$/, '')}]`;
    return segment.replace(/[^A-Za-z0-9_.-]/g, '-');
  });
  return `app/${segments.join('/')}/page`;
}

function finding(code, severity, file, message) { return { code, severity, file, message }; }
function dedupe(items, key) { const seen = new Set(); return items.filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; }); }
