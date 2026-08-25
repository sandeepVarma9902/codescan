import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exists, readJson, walk, writeJson } from './utils.js';

const TAGS = { div: 'View', section: 'View', main: 'View', header: 'View', footer: 'View', nav: 'View', form: 'View', ul: 'View', ol: 'View', span: 'Text', p: 'Text', h1: 'Text', h2: 'Text', h3: 'Text', h4: 'Text', label: 'Text', strong: 'Text', em: 'Text', li: 'Text', button: 'Pressable', input: 'TextInput', textarea: 'TextInput', img: 'Image' };
const RECIPE_PACKAGES = {
  'native-primitives': { '@react-native-picker/picker': '^2.11.0' }, 'nativewind-styling': { nativewind: '^4.2.0' }, 'async-storage': { '@react-native-async-storage/async-storage': '^2.2.0' }, 'gesture-handler': { 'react-native-gesture-handler': '^2.28.0', 'react-native-reanimated': '^4.1.0' }, 'expo-document-picker': { 'expo-document-picker': '~14.0.0', 'expo-file-system': '~19.0.0' }, 'expo-image': { 'expo-image': '~3.0.0', 'react-native-svg': '^15.12.0' }, 'expo-location': { 'expo-location': '~19.0.0' }, 'expo-notifications': { 'expo-notifications': '~0.32.0' }, 'expo-auth-session': { 'expo-auth-session': '~7.0.0', 'expo-secure-store': '~15.0.0' }, 'native-maps': { 'react-native-maps': '^1.20.0' }, 'native-charts': { 'victory-native': '^41.0.0', 'react-native-svg': '^15.12.0' }, 'native-paper': { 'react-native-paper': '^5.14.0' }
};

export async function transformReactToNative(root, { analysis } = {}) {
  const appSource = await findApp(root);
  const pkg = await readJson(path.join(root, 'package.json'));
  pkg.main = 'expo-router/entry';
  pkg.scripts = { start: 'expo start', android: 'expo start --android', ios: 'expo start --ios', web: 'expo start --web', build: 'expo export --platform all --output-dir dist-expo' };
  pkg.dependencies = cleanDependencies(pkg.dependencies || {});
  Object.assign(pkg.dependencies, { expo: '~57.0.0', 'expo-constants': '~57.0.0', 'expo-linking': '~57.0.0', 'expo-router': '~57.0.0', 'expo-status-bar': '~57.0.0', react: '19.2.3', 'react-native': '0.86.0', 'react-native-safe-area-context': '^5.6.0', 'react-native-screens': '^4.16.0', 'react-native-web': '^0.21.0' });
  for (const recommendation of analysis?.recommendations || []) Object.assign(pkg.dependencies, RECIPE_PACKAGES[recommendation.id] || {});
  pkg.devDependencies = cleanDependencies(pkg.devDependencies || {});
  pkg.devDependencies.typescript = pkg.devDependencies.typescript || '^5.9.0';
  if (analysis?.recommendations?.some((item) => item.id === 'nativewind-styling')) pkg.devDependencies.tailwindcss ||= '^3.4.0';
  pkg.engines = { ...(pkg.engines || {}), node: '>=22.13.0' };
  await writeJson(path.join(root, 'package.json'), pkg);
  const changes = ['package.json'];

  await writeJson(path.join(root, 'app.json'), { expo: { name: pkg.name || 'Modernized App', slug: slug(pkg.name || 'modernized-app'), scheme: slug(pkg.name || 'modernized-app'), plugins: ['expo-router'], experiments: { typedRoutes: true }, web: { bundler: 'metro' } } });
  await writeJson(path.join(root, 'tsconfig.json'), { extends: 'expo/tsconfig.base', compilerOptions: { strict: true, paths: { '@/*': ['./*'] } }, include: ['**/*.ts', '**/*.tsx', '.expo/types/**/*.ts', 'expo-env.d.ts'] });
  await fs.writeFile(path.join(root, 'expo-env.d.ts'), '/// <reference types="expo/types" />\n');
  await fs.mkdir(path.join(root, 'app'), { recursive: true });
  await fs.writeFile(path.join(root, 'app', '_layout.tsx'), "import { Stack } from 'expo-router';\n\nexport default function RootLayout() {\n  return <Stack />;\n}\n");
  await fs.writeFile(path.join(root, 'app', 'index.tsx'), "import * as AppModule from '../native-src/App';\n\nconst NativeApp = AppModule.default ?? AppModule.App;\n\nexport default function Index() {\n  return <NativeApp />;\n}\n");
  changes.push('app.json', 'tsconfig.json', 'expo-env.d.ts', 'app/_layout.tsx', 'app/index.tsx');
  await writeJson(path.join(root, 'migration-decisions.json'), { schemaVersion: 1, target: 'react-native', approval: 'approved by selecting the React Native migration target', recommendations: analysis?.findings || [], requiredReview: ['Run on iOS and Android', 'Confirm permissions and external credentials', 'Resolve generated TODO comments'] });
  changes.push('migration-decisions.json');
  if (analysis?.recommendations?.some((item) => item.id === 'nativewind-styling')) {
    await fs.writeFile(path.join(root, 'global.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
    await fs.writeFile(path.join(root, 'tailwind.config.js'), "module.exports = { content: ['./app/**/*.{js,jsx,ts,tsx}', './native-src/**/*.{js,jsx,ts,tsx}'], presets: [require('nativewind/preset')] };\n");
    await fs.writeFile(path.join(root, 'babel.config.js'), "module.exports = function (api) { api.cache(true); return { presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]], plugins: ['react-native-reanimated/plugin'] }; };\n");
    await fs.writeFile(path.join(root, 'app', '_layout.tsx'), "import '../global.css';\nimport { Stack } from 'expo-router';\n\nexport default function RootLayout() { return <Stack />; }\n");
    changes.push('global.css', 'tailwind.config.js', 'babel.config.js');
  }
  await writePlatformAdapters(root, new Set((analysis?.recommendations || []).map((item) => item.id)), changes);

  const sourceRoot = path.join(root, 'src');
  for (const file of await walk(sourceRoot)) {
    if (!/\.[jt]sx?$/.test(file)) continue;
    const relative = path.relative(sourceRoot, file).replace(/\.(?:js|jsx)$/, '.tsx');
    if (/^(?:index|main)\.(?:ts|tsx)$/.test(relative)) continue;
    const destination = path.join(root, 'native-src', relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const converted = convertSafeJsx(await fs.readFile(file, 'utf8'));
    await fs.writeFile(destination, converted);
    changes.push(path.relative(root, destination));
  }
  for (const name of ['.env', '.env.local', '.env.development', '.env.production']) {
    const file = path.join(root, name);
    if (!(await exists(file))) continue;
    const before = await fs.readFile(file, 'utf8');
    const after = before.replace(/(^|\n)(\s*)(?:REACT_APP_|VITE_|NEXT_PUBLIC_)([A-Z0-9_]+)(\s*=)/g, '$1$2EXPO_PUBLIC_$3$4');
    if (after !== before) { await fs.writeFile(file, after); changes.push(name); }
  }
  if (!changes.some((item) => item.endsWith(path.basename(appSource).replace(/\.(?:js|jsx)$/, '.tsx')))) throw new Error('Failed to convert src/App into native-src/App.');
  return [...new Set(changes)].sort();
}

export function convertSafeJsx(content) {
  const used = new Set();
  let output = content.replace(/process\.env\.(?:REACT_APP_|NEXT_PUBLIC_)([A-Z0-9_]+)/g, 'process.env.EXPO_PUBLIC_$1').replace(/import\.meta\.env\.VITE_([A-Z0-9_]+)/g, 'process.env.EXPO_PUBLIC_$1').replace(/^import\s+['"][^'"]+\.(?:css|scss|sass|less)['"]\s*;?$/gm, '// TODO(repo-upgrader): port imported stylesheet rules to NativeWind tokens.').replace(/\bonClick=/g, 'onPress=');
  const usesRouter = /\buseNavigate\s*\(/.test(output);
  output = output
    .replace(/import\s+[^;]+?from\s+['"]react-router-dom['"]\s*;?/g, '')
    .replace(/<\/?(?:BrowserRouter|HashRouter|Routes)\b[^>]*>/g, (tag) => tag.startsWith('</') ? '</>' : '<>')
    .replace(/<Route\b[^>]*\belement=\{/g, '<>')
    .replace(/\}\s*\/>/g, '</>')
    .replace(/const\s+(\w+)\s*=\s*useNavigate\s*\(\s*\)\s*;?/g, 'const router = useRouter();')
    .replace(/\bnavigate\s*\(/g, 'router.push(');
  if (usesRouter) output = `import { useRouter } from 'expo-router';\n${output}`;
  output = output.replace(/<a\b/g, '<Link').replace(/<\/a>/g, '</Link>');
  if (/<\/?Link\b/.test(output)) output = `import { Link } from 'expo-router';\n${output}`;
  output = output.replace(/<select\b/g, '<Picker').replace(/<\/select>/g, '</Picker>').replace(/<option\b/g, '<Picker.Item').replace(/<\/option>/g, '</Picker.Item>');
  if (/<\/?Picker(?:\.|\b)/.test(output)) output = `import { Picker } from '@react-native-picker/picker';\n${output}`;
  output = output.replace(/<img\s+([^>]*?)src=(["'])([^"']+)\2([^>]*?)\/?\s*>/g, (_match, before, _quote, source, after) => `<Image ${before}source={{ uri: ${JSON.stringify(source)} }}${after} />`);
  for (const [html, native] of Object.entries(TAGS)) {
    const pattern = new RegExp(`<(/?)${html}(?=[\\s>])`, 'g');
    if (pattern.test(output)) { used.add(native); output = output.replace(pattern, `<$1${native}`); }
  }
  if (used.size) output = `import { ${[...used].sort().join(', ')} } from 'react-native';\n${output}`;
  return output.replace(/from\s+(["'][^"']+)\.(?:js|jsx)(["'])/g, 'from $1.tsx$2');
}

async function writePlatformAdapters(root, recipes, changes) {
  const directory = path.join(root, 'native-src', 'platform');
  await fs.mkdir(directory, { recursive: true });
  const lines = ["import * as Linking from 'expo-linking';", "import { Platform } from 'react-native';"];
  if (recipes.has('async-storage')) lines.push("import AsyncStorage from '@react-native-async-storage/async-storage';", 'export const storage = { getItem: AsyncStorage.getItem, setItem: AsyncStorage.setItem, removeItem: AsyncStorage.removeItem };');
  if (recipes.has('expo-document-picker')) lines.push("import * as DocumentPicker from 'expo-document-picker';", 'export const pickDocument = () => DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });');
  if (recipes.has('expo-location')) lines.push("import * as Location from 'expo-location';", 'export async function currentLocation(){ await Location.requestForegroundPermissionsAsync(); return Location.getCurrentPositionAsync({}); }');
  if (recipes.has('expo-notifications')) lines.push("import * as Notifications from 'expo-notifications';", 'export const requestNotificationPermission = () => Notifications.requestPermissionsAsync();');
  if (recipes.has('expo-auth-session')) lines.push("import * as AuthSession from 'expo-auth-session';", "export const authRedirectUri = () => AuthSession.makeRedirectUri({ scheme: 'modernized-app' });");
  lines.push('export const openExternalUrl = (url: string) => Linking.openURL(url);', 'export const platformName = Platform.OS;', '// TODO(repo-upgrader): connect generated adapters at each call site listed in migration-decisions.json.');
  await fs.writeFile(path.join(directory, 'index.ts'), `${lines.join('\n')}\n`);
  changes.push('native-src/platform/index.ts');
}

function cleanDependencies(dependencies) { const cleaned = { ...dependencies }; for (const name of ['react-dom', 'react-scripts', 'react-router-dom', '@mui/material', 'antd', 'next', 'vite', '@vitejs/plugin-react']) delete cleaned[name]; return cleaned; }
async function findApp(root) { for (const file of ['src/App.jsx', 'src/App.js', 'src/App.tsx', 'src/App.ts']) if (await exists(path.join(root, file))) return file; throw new Error('A conventional src/App component is required for React Native conversion.'); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'modernized-app'; }
