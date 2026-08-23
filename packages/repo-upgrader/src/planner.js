export function createPlan(scan, target = 'vite') {
  if (target === 'nextjs') {
    return {
      schemaVersion: 1,
      migration: 'react-to-nextjs',
      status: 'foundation-only',
      supported: false,
      reason: 'Automated React to Next.js transforms are intentionally gated until routing and rendering semantics can be verified.',
      phases: ['inventory routes and data fetching', 'classify SSR/client-only boundaries', 'generate App Router mapping', 'transform and verify incrementally']
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
    preconditions: scan.capabilities.craToVite ? [] : ['Repository must be detected as Create React App'],
    changes,
    verification: ['dependency install', 'build', 'test when configured', 'lint when configured'],
    rollback: 'A byte-for-byte checkpoint is created before mutation.'
  };
}
