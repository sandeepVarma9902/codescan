import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectDecisionBlockers, recommendedResolutions, resolveBlockers } from '../src/service/blocker-decisions.js';

test('detects incompatible libraries and provides ranked continuations', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'modernizer-blockers-'));
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ dependencies: { 'react-router-dom': '^6.0.0', 'react-dom': '^19.0.0' } }));
  const blockers = await detectDecisionBlockers(directory, 'react-native');
  assert.equal(blockers.length, 2);
  assert.equal(blockers[0].status, 'open');
  assert.ok(blockers.every((blocker) => blocker.options.some((option) => option.recommended)));
  assert.ok(blockers.every((blocker) => blocker.options.some((option) => option.kind === 'fallback' || option.kind === 'skip')));
});

test('resolves every blocker and records an auditable decision', () => {
  const blockers = [{ id: 'one', category: 'library-incompatibility', dependency: 'old-lib', options: [{ id: 'new-lib', label: 'Use new lib', kind: 'recommended' }], status: 'open' }];
  const result = resolveBlockers(blockers, recommendedResolutions(blockers), 'tester');
  assert.equal(result.blockers[0].status, 'resolved');
  assert.equal(result.decisions[0].optionId, 'new-lib');
  assert.equal(result.decisions[0].actor, 'tester');
  assert.match(result.decisions[0].decidedAt, /^\d{4}-/);
});

test('requires instructions when the user chooses a custom solution', () => {
  const blockers = [{ id: 'one', options: [{ id: 'custom', label: 'Custom', kind: 'custom' }] }];
  assert.throws(() => resolveBlockers(blockers, [{ blockerId: 'one', optionId: 'custom' }]), /Custom instructions/);
});
