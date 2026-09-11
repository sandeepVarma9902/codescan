import { promises as fs } from 'node:fs';
import path from 'node:path';

const CATALOG = {
  'react-native': {
    'react-router-dom': {
      title: 'Web routing is not available in a native application',
      explanation: 'react-router-dom depends on browser URLs and DOM history, which React Native does not provide.',
      options: [
        option('expo-router', 'Replace with Expo Router', 'Automatic file-based native navigation with deep-link support.', 'recommended', 'low', true),
        option('react-navigation', 'Replace with React Navigation', 'Use an explicit navigation structure with more manual configuration.', 'alternative', 'low', false),
        option('webview', 'Keep this feature in a WebView', 'Preserve the web experience temporarily inside the mobile application.', 'fallback', 'medium', false),
        option('skip', 'Skip navigation conversion', 'Continue without converting navigation; affected screens will require follow-up.', 'skip', 'high', false)
      ]
    },
    'react-dom': {
      title: 'Browser rendering APIs cannot run in React Native',
      explanation: 'react-dom renders HTML elements and must be replaced by React Native primitives.',
      options: [
        option('native-primitives', 'Convert to native components', 'Replace compatible HTML elements with View, Text, Image, Pressable, and native inputs.', 'recommended', 'medium', true),
        option('webview', 'Preserve complex screens in a WebView', 'Use a compatibility bridge for screens that cannot yet be expressed natively.', 'fallback', 'medium', false),
        option('skip', 'Leave complex screens for manual work', 'Continue with the rest of the application and list affected screens in the report.', 'skip', 'high', false)
      ]
    }
  },
  nextjs: {
    'react-router-dom': {
      title: 'Client-side routes need a Next.js routing strategy',
      explanation: 'Next.js uses filesystem routes and different navigation APIs.',
      options: [
        option('app-router', 'Convert to the Next.js App Router', 'Create app routes and replace navigation hooks with next/navigation.', 'recommended', 'medium', true),
        option('pages-router', 'Use the Pages Router', 'Choose the older, broadly understood Next.js routing model.', 'alternative', 'medium', false),
        option('spa-shell', 'Keep the SPA behind one Next.js route', 'Preserve current routing temporarily while adopting Next.js incrementally.', 'fallback', 'low', true)
      ]
    }
  },
  vite: {
    '@craco/craco': {
      title: 'Custom CRA overrides need a Vite equivalent',
      explanation: 'CRACO configuration cannot be executed by Vite and must be translated or retired.',
      options: [
        option('translate-config', 'Translate supported overrides', 'Convert aliases, plugins, environment settings, and dev-server options where possible.', 'recommended', 'medium', true),
        option('clean-vite', 'Start with a clean Vite configuration', 'Remove CRA overrides and document behavior that needs to be restored.', 'alternative', 'medium', true),
        option('manual-config', 'Provide a custom Vite configuration', 'Pause configuration replacement and use instructions supplied by your team.', 'custom', 'variable', false)
      ]
    },
    'react-app-rewired': {
      title: 'Webpack overrides need a Vite equivalent',
      explanation: 'react-app-rewired customizations are specific to Create React App and webpack.',
      options: [
        option('translate-config', 'Translate supported overrides', 'Map aliases, plugins, and development settings into Vite configuration.', 'recommended', 'medium', true),
        option('clean-vite', 'Use a clean Vite configuration', 'Continue with standard Vite defaults and report removed custom behavior.', 'alternative', 'medium', true),
        option('manual-config', 'Provide custom migration instructions', 'Use a replacement package or configuration selected by your team.', 'custom', 'variable', false)
      ]
    }
  }
};

export async function detectDecisionBlockers(repositoryPath, target) {
  const catalog = CATALOG[target] || {};
  if (!Object.keys(catalog).length) return [];
  const manifest = await readManifest(repositoryPath);
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  return Object.entries(catalog).filter(([dependency]) => dependencies[dependency]).map(([dependency, definition], index) => ({
    id: `${target}-${slug(dependency)}-${index + 1}`,
    category: 'library-incompatibility',
    severity: 'decision-required',
    target,
    dependency,
    installedVersion: dependencies[dependency],
    ...structuredClone(definition),
    status: 'open'
  }));
}

export function resolveBlockers(blockers, resolutions, actor = 'user') {
  if (!Array.isArray(blockers) || blockers.length === 0) throw httpError(409, 'This migration has no decisions awaiting approval.');
  if (!Array.isArray(resolutions)) throw httpError(400, 'resolutions must be an array.');
  const byId = new Map(resolutions.map((resolution) => [resolution.blockerId, resolution]));
  const now = new Date().toISOString();
  const resolved = blockers.map((blocker) => {
    const resolution = byId.get(blocker.id);
    if (!resolution) throw httpError(400, `A resolution is required for blocker ${blocker.id}.`);
    const selected = blocker.options.find((candidate) => candidate.id === resolution.optionId);
    if (!selected) throw httpError(400, `Invalid option for blocker ${blocker.id}.`);
    const instructions = String(resolution.instructions || '').trim();
    if (instructions.length > 4000) throw httpError(400, `Instructions for blocker ${blocker.id} must be 4000 characters or fewer.`);
    if (selected.kind === 'custom' && !instructions) throw httpError(400, `Custom instructions are required for blocker ${blocker.id}.`);
    return { ...blocker, status: 'resolved', resolution: { optionId: selected.id, label: selected.label, instructions: instructions || null, actor, decidedAt: now } };
  });
  return { blockers: resolved, decisions: resolved.map(({ id, category, dependency, resolution }) => ({ blockerId: id, category, dependency, ...resolution })) };
}

export function recommendedResolutions(blockers) {
  return blockers.map((blocker) => ({ blockerId: blocker.id, optionId: (blocker.options.find((optionValue) => optionValue.recommended) || blocker.options[0]).id }));
}

async function readManifest(repositoryPath) {
  try { return JSON.parse(await fs.readFile(path.join(repositoryPath, 'package.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
function option(id, label, impact, kind, risk, automatic) { return { id, label, impact, kind, risk, automatic, recommended: kind === 'recommended' }; }
function slug(value) { return value.replace(/^@/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }
function httpError(statusCode, message) { const error = new Error(message); error.statusCode = statusCode; return error; }
