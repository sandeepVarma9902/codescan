import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exists, readJson, walk, writeJson } from './utils.js';

const TAGS = { div: 'View', section: 'View', main: 'View', header: 'View', footer: 'View', nav: 'View', span: 'Text', p: 'Text', h1: 'Text', h2: 'Text', h3: 'Text', h4: 'Text', label: 'Text' };

export async function transformReactToNative(root) {
  const appSource = await findApp(root);
  const pkg = await readJson(path.join(root, 'package.json'));
  pkg.main = 'expo-router/entry';
  pkg.scripts = { start: 'expo start', android: 'expo start --android', ios: 'expo start --ios', web: 'expo start --web', build: 'expo export --platform all --output-dir dist-expo' };
  pkg.dependencies = cleanDependencies(pkg.dependencies || {});
  Object.assign(pkg.dependencies, { expo: '~57.0.0', 'expo-constants': '~57.0.0', 'expo-linking': '~57.0.0', 'expo-router': '~57.0.0', 'expo-status-bar': '~57.0.0', react: '19.2.3', 'react-native': '0.86.0', 'react-native-safe-area-context': '^5.6.0', 'react-native-screens': '^4.16.0', 'react-native-web': '^0.21.0' });
  pkg.devDependencies = cleanDependencies(pkg.devDependencies || {});
  pkg.devDependencies.typescript = pkg.devDependencies.typescript || '^5.9.0';
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
  let output = content.replace(/process\.env\.(?:REACT_APP_|NEXT_PUBLIC_)([A-Z0-9_]+)/g, 'process.env.EXPO_PUBLIC_$1').replace(/import\.meta\.env\.VITE_([A-Z0-9_]+)/g, 'process.env.EXPO_PUBLIC_$1');
  for (const [html, native] of Object.entries(TAGS)) {
    const pattern = new RegExp(`<(/?)${html}(?=[\\s>])`, 'g');
    if (pattern.test(output)) { used.add(native); output = output.replace(pattern, `<$1${native}`); }
  }
  if (used.size) output = `import { ${[...used].sort().join(', ')} } from 'react-native';\n${output}`;
  return output.replace(/from\s+(["'][^"']+)\.(?:js|jsx)(["'])/g, 'from $1.tsx$2');
}

function cleanDependencies(dependencies) { const cleaned = { ...dependencies }; for (const name of ['react-dom', 'react-scripts', 'react-router-dom', 'next', 'vite', '@vitejs/plugin-react']) delete cleaned[name]; return cleaned; }
async function findApp(root) { for (const file of ['src/App.jsx', 'src/App.js', 'src/App.tsx', 'src/App.ts']) if (await exists(path.join(root, file))) return file; throw new Error('A conventional src/App component is required for React Native conversion.'); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'modernized-app'; }
