import assert from 'node:assert/strict';
import test from 'node:test';
import { configureArisRepo, parseModelRef, safeInputPath, nextHistory } from '../extensions/aris-reviewer-core.ts';

test('reviewer model reference separates provider from model ID', () => {
  assert.deepEqual(parseModelRef('openai/gpt-4o'), { provider: 'openai', id: 'gpt-4o' });
  assert.throws(() => parseModelRef('gpt-4o'), /provider\/model/);
});

test('reviewer input cannot escape the project directory', () => {
  assert.equal(safeInputPath('/work/project', 'notes.txt'), '/work/project/notes.txt');
  assert.throws(() => safeInputPath('/work/project', '../secret.txt'), /outside the project/);
});

test('review history appends a complete round', () => {
  assert.deepEqual(nextHistory([], 'question', 'answer'), [
    { role: 'user', text: 'question' },
    { role: 'assistant', text: 'answer' },
  ]);
});

test('package exposes its tools directory without replacing an explicit ARIS_REPO', () => {
  const env = {};
  assert.equal(configureArisRepo('/package', env), '/package');
  assert.equal(env.ARIS_REPO, '/package');
  assert.equal(configureArisRepo('/other-package', env), '/package');
});
