import { recipe } from './react-native-recipes.js';

const ELEMENT_MAP = {
  div: 'View', section: 'View', main: 'View', header: 'View', footer: 'View', nav: 'View', form: 'View', ul: 'View', ol: 'View',
  span: 'Text', p: 'Text', h1: 'Text', h2: 'Text', h3: 'Text', h4: 'Text', label: 'Text', strong: 'Text', em: 'Text', li: 'Text',
  button: 'Pressable', input: 'TextInput', textarea: 'TextInput', img: 'Image', a: 'Link', select: 'Picker', option: 'Picker.Item'
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
    if (unmapped.length) findings.push(finding('custom-native-components', file, `Generate native component boundaries for: ${unmapped.join(', ')}.`, 'manual-native-component', 'high'));
    if (/\b(?:localStorage|sessionStorage)\b/.test(content)) findings.push(finding('browser-storage', file, 'Use an asynchronous native storage adapter.', 'async-storage'));
    if (/\bwindow\.location\b|window\.open\s*\(/.test(content)) findings.push(finding('browser-navigation', file, 'Use Expo Router and Linking for navigation.', 'expo-linking'));
    if (/\b(?:document|window)(?:\.|\[)/.test(content)) findings.push(finding('browser-platform-api', file, 'Move remaining browser access behind a typed platform adapter.', 'platform-adapter', 'high'));
    if (/\bon(?:Drag|Drop|Mouse|Wheel|ContextMenu)\b/.test(content)) findings.push(finding('desktop-pointer-events', file, 'Translate pointer behavior to touch gestures.', 'gesture-handler'));
    if (/\bclassName\s*=|\.(?:css|scss|sass|less)["']/.test(content)) findings.push(finding('web-styling', file, 'Preserve class contracts with NativeWind and review imported stylesheet rules.', 'nativewind-styling'));
    if (elements.some((element) => ['button', 'input', 'textarea', 'img', 'a', 'form', 'select'].includes(element))) findings.push(finding('interactive-native-controls', file, 'Apply behavior-aware native controls.', 'native-primitives'));
    if (/type\s*=\s*["']file["']|FileReader|new\s+Blob\b/.test(content)) findings.push(finding('browser-files', file, 'Use native document picker and filesystem APIs.', 'expo-document-picker'));
    if (/\.svg["']|<svg\b/.test(content)) findings.push(finding('svg-media', file, 'Use react-native-svg for scalable media.', 'expo-image'));
    if (/geolocation|navigator\.permissions/.test(content)) findings.push(finding('device-location', file, 'Use Expo Location with platform permissions.', 'expo-location'));
    if (/\bNotification\b|serviceWorker/.test(content)) findings.push(finding('notifications', file, 'Use Expo Notifications and native delivery configuration.', 'expo-notifications'));
    if (/OAuth|window\.open|document\.cookie|\bcookies?\b/i.test(content)) findings.push(finding('browser-auth', file, 'Use AuthSession and SecureStore for mobile authentication.', 'expo-auth-session', 'high'));
    if (/\b(?:GoogleMap|MapContainer|mapboxgl|leaflet)\b/.test(content)) findings.push(finding('web-maps', file, 'Use react-native-maps and supply platform keys.', 'native-maps', 'high'));
    if (/<canvas\b|\b(?:Chart|Recharts|d3)\b/.test(content)) findings.push(finding('canvas-charts', file, 'Use a native SVG chart renderer or generated native component boundary.', 'native-charts', 'high'));
    for (const match of content.matchAll(/<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["']/g)) routeCandidates.push({ sourceFile: file, webPath: match[1], expoRoute: expoRoute(match[1]) });
    if (elements.length) components.push({ file, elements: mappings, suggestedFile: file.replace(/^src\//, 'components/').replace(/\.jsx?$/, '.tsx') });
  }

  if (dependencies['react-router-dom']) findings.push(finding('web-dependency:react-router-dom', 'package.json', 'Replace React Router with Expo Router.', 'expo-router'));
  if (dependencies['@mui/material'] || dependencies.antd) findings.push(finding('web-component-system', 'package.json', 'Replace the web component system incrementally with React Native Paper.', 'native-paper', 'high'));
  const unique = deduplicate(findings);
  const highRisk = unique.filter((item) => item.risk === 'high').length;
  const score = Math.max(20, 100 - unique.length * 4 - highRisk * 6);
  return {
    schemaVersion: 2,
    recommendedFramework: 'expo-router',
    readiness: { score, level: unique.length ? 'approval-required' : 'high', blockers: 0, warnings: unique.length },
    components,
    elementInventory,
    primitiveMappings: Object.entries(elementInventory).map(([from, count]) => ({ from, to: ELEMENT_MAP[from] || 'GeneratedNativeComponent', count })),
    routeCandidates,
    findings: unique,
    recommendations: unique.map((item) => item.recipe),
    gates: unique.length ? ['recommended native recipes approved', 'generated TODO decisions reviewed', 'iOS and Android behavioral tests available'] : ['iOS and Android behavioral tests available'],
    approvalRequired: unique.length > 0,
    automaticConversionEligible: true,
    convertible: true
  };
}

export function expoRoute(webPath) {
  if (!webPath || webPath === '/') return 'app/index.tsx';
  const segments = webPath.split('/').filter(Boolean).map((segment) => segment === '*' ? '[...slug]' : segment.startsWith(':') ? `[${segment.slice(1).replace(/\?$/, '')}]` : segment);
  return `app/${segments.join('/')}.tsx`;
}

function finding(code, file, message, recipeId, risk = 'medium') { return { code, severity: 'recommendation', risk, file, message, approvalRequired: true, recipe: recipe(recipeId) }; }
function deduplicate(findings) { return [...new Map(findings.map((item) => [`${item.code}:${item.file}`, item])).values()]; }
