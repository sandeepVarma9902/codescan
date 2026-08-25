export function createPlan(scan, target = 'vite') {
  if (target === 'react-native') {
    const analysis = scan.reactNative;
    const eligible = analysis?.automaticConversionEligible === true;
    return {
      schemaVersion: 1,
      migration: 'react-to-react-native',
      status: 'analysis-ready',
      supported: eligible,
      strategy: 'expo-router-incremental-conversion',
      reason: eligible ? 'Eligible for a conservative Expo Router conversion of safe structural and text components.' : 'Automated mutation remains gated until native navigation, styling, platform API, interaction, and device-test decisions are approved.',
      readiness: analysis?.readiness,
      framework: analysis?.recommendedFramework || 'expo-router',
      componentMappings: analysis?.components || [],
      primitiveMappings: analysis?.primitiveMappings || [],
      routeMappings: analysis?.routeCandidates || [],
      findings: analysis?.findings || [],
      gates: analysis?.gates || [],
      phases: ['create Expo Router workspace', 'convert shared logic and data modules', 'convert design tokens and styling', 'replace DOM primitives component-by-component', 'replace browser APIs with platform adapters', 'convert navigation', 'verify on iOS, Android, and web']
    };
  }
  if (target === 'nextjs') {
    const analysis = scan.nextjs;
    const bridgeSupported = analysis?.readiness?.level === 'high' && analysis.readiness.blockers === 0;
    return {
      schemaVersion: 1,
      migration: 'react-to-nextjs',
      status: analysis ? 'analysis-ready' : 'foundation-only',
      supported: bridgeSupported,
      strategy: 'spa-compatibility-bridge',
      reason: bridgeSupported ? 'Eligible for a client-rendered App Router compatibility bridge; route-by-route server migration remains gated.' : 'Compatibility bridge is gated until readiness is high or an operator explicitly uses --force.',
      readiness: analysis?.readiness,
      routeMappings: analysis?.routes || [],
      clientBoundaries: analysis?.clientBoundaries || [],
      dataFetching: analysis?.dataFetching || [],
      findings: analysis?.findings || [],
      gates: analysis?.gates || [],
      phases: ['create verified client-rendered App Router compatibility bridge', 'approve route-to-App-Router mapping', 'separate server and client component boundaries', 'move eligible data fetching to the server', 'transform routes incrementally', 'verify behavior and rendering']
    };
  }
  if (target !== 'vite') throw new Error(`Unsupported target: ${target}`);
  const changes = [
    { id: 'package-json', action: 'replace react-scripts with Vite and update scripts' },
    { id: 'html-entry', action: 'create root index.html from CRA public template' },
    { id: 'source-entry', action: 'make the source entry compatible with Vite' },
    { id: 'env-vars', action: 'rewrite REACT_APP_* access to VITE_*' },
    { id: 'cleanup', action: 'remove migrated CRA-only files' }
  ];
  if (scan.craCompatibility?.pathAliases) changes.push({ id: 'path-aliases', action: 'preserve TypeScript/JavaScript path aliases with vite-tsconfig-paths' });
  if (scan.craCompatibility?.svgComponentImports?.length) changes.push({ id: 'svg-components', action: 'convert CRA ReactComponent SVG imports with vite-plugin-svgr' });
  if (scan.craCompatibility?.proxyRoutes?.length) changes.push({ id: 'development-proxy', action: 'translate conventional setupProxy routes to Vite server.proxy' });
  if (scan.craCompatibility?.serviceWorker?.strategy === 'vite-plugin-pwa-auto-update') changes.push({ id: 'service-worker', action: 'replace conventional CRA registration with vite-plugin-pwa auto-update registration' });
  return {
    schemaVersion: 1,
    migration: 'cra-to-vite',
    supported: scan.capabilities.craToVite,
    confidence: scan.confidence,
    preconditions: scan.capabilities.craToVite ? [] : scan.risk?.blockers
      ? scan.risk.findings.filter((item) => item.severity === 'blocker').map((item) => item.message)
      : ['Repository must be detected as Create React App'],
    risk: scan.risk || { level: 'unknown', blockers: 0, warnings: 0, findings: [] },
    changes,
    verification: ['dependency install', 'Vite production build', 'Vitest test suite when CRA tests are configured', 'lint when configured'],
    rollback: 'A byte-for-byte checkpoint is created before mutation.'
  };
}
