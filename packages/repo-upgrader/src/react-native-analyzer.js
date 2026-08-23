const ELEMENT_MAP = {
  div: 'View', section: 'View', main: 'View', header: 'View', footer: 'View', nav: 'View',
  span: 'Text', p: 'Text', h1: 'Text', h2: 'Text', h3: 'Text', h4: 'Text', label: 'Text',
  button: 'Pressable', input: 'TextInput', textarea: 'TextInput', img: 'Image', a: 'Link', ul: 'FlatList', ol: 'FlatList'
};

export function analyzeReactNativeReadiness(sourceRecords, dependencies = {}) {
  const findings = [];
  const components = [];
  const elementInventory = {};
  const routeCandidates = [];

  for (const { file, content } of sourceRecords) {
    const elements = [...content.matchAll(/<([a-z][a-z0-9-]*)\b/g)].map((match) => match[1]);
    for (const element of elements) elementInventory[element] = (elementInventory[element] || 0) + 1;
    const mappings = [...new Set(elements)].map((element) => ({ from: element, to: ELEMENT_MAP[element] || null }));
    const unmapped = mappings.filter((item) => !item.to).map((item) => item.from);
    if (unmapped.length) findings.push(finding('unmapped-dom-elements', 'blocker', file, `No safe native primitive mapping for: ${unmapped.join(', ')}.`));
    if (/\b(?:document|window\.location|localStorage|sessionStorage)\b/.test(content)) findings.push(finding('browser-platform-api', 'blocker', file, 'Browser platform APIs require native storage, linking, or platform-specific adapters.'));
    if (/\bon(?:Drag|Drop|Mouse|Wheel|ContextMenu)\b/.test(content)) findings.push(finding('desktop-pointer-events', 'warning', file, 'Desktop pointer interactions require touch and gesture design.'));
    if (/\bclassName\s*=/.test(content)) findings.push(finding('css-class-styling', 'warning', file, 'CSS class styling must be converted to StyleSheet, NativeWind, or another native styling strategy.'));
    if (/\.(?:css|scss|sass|less)["']/.test(content)) findings.push(finding('stylesheet-import', 'warning', file, 'Web stylesheets cannot be consumed directly by native platforms.'));
    for (const match of content.matchAll(/<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["']/g)) routeCandidates.push({ sourceFile: file, webPath: match[1], expoRoute: expoRoute(match[1]) });
    if (elements.length) components.push({ file, elements: mappings, suggestedFile: file.replace(/^src\//, 'components/').replace(/\.jsx?$/, '.tsx') });
  }

  for (const dependency of ['react-dom', '@mui/material', 'antd', 'react-router-dom']) {
    if (dependencies[dependency]) findings.push(finding(`web-dependency:${dependency}`, dependency === 'react-dom' ? 'warning' : 'blocker', 'package.json', `${dependency} requires removal or a React Native replacement.`));
  }
  const blockers = findings.filter((item) => item.severity === 'blocker').length;
  const warnings = findings.filter((item) => item.severity === 'warning').length;
  const score = Math.max(0, 100 - blockers * 20 - warnings * 5);
  return {
    schemaVersion: 1,
    recommendedFramework: 'expo-router',
    readiness: { score, level: blockers ? 'blocked' : score >= 90 ? 'high' : score >= 60 ? 'medium' : 'low', blockers, warnings },
    components,
    elementInventory,
    primitiveMappings: Object.entries(elementInventory).map(([from, count]) => ({ from, to: ELEMENT_MAP[from] || null, count })),
    routeCandidates,
    findings,
    gates: ['native navigation approved', 'styling strategy approved', 'platform API adapters selected', 'touch interactions reviewed', 'iOS and Android behavioral tests available']
  };
}

export function expoRoute(webPath) {
  if (!webPath || webPath === '/') return 'app/index.tsx';
  const segments = webPath.split('/').filter(Boolean).map((segment) => segment === '*' ? '[...slug]' : segment.startsWith(':') ? `[${segment.slice(1).replace(/\?$/, '')}]` : segment);
  return `app/${segments.join('/')}.tsx`;
}

function finding(code, severity, file, message) { return { code, severity, file, message }; }
