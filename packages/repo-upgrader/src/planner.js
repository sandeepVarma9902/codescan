export function createPlan(scan, target = 'vite') {
  if (target === 'nextjs') {
    const analysis = scan.nextjs;
    return {
      schemaVersion: 1,
      migration: 'react-to-nextjs',
      status: analysis ? 'analysis-ready' : 'foundation-only',
      supported: false,
      reason: 'Automated transforms remain gated until route, rendering, data-fetching, and behavioral-test approvals are satisfied.',
      readiness: analysis?.readiness,
      routeMappings: analysis?.routes || [],
      clientBoundaries: analysis?.clientBoundaries || [],
      dataFetching: analysis?.dataFetching || [],
      findings: analysis?.findings || [],
      gates: analysis?.gates || [],
      phases: ['approve route-to-App-Router mapping', 'establish root layout and providers', 'separate server and client component boundaries', 'move eligible data fetching to the server', 'transform routes incrementally', 'verify behavior and rendering']
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
