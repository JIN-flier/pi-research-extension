import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Value } from 'typebox/value';
import registerGate, { evaluateReviewGate } from '../extensions/review-gate/review-gate.ts';
import { parseAssessment } from '../extensions/review-gate/evaluator.ts';
import { runReviewSession } from '../extensions/aris-reviewer/review-session-manager.ts';

const threadId = '11111111-1111-4111-8111-111111111111';
let tool;
registerGate({ registerTool: definition => { tool = definition; } });

async function setup(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'aris-gate-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const sessionPath = `.aris/reviewer-sessions/${threadId}.json`;
  const absolute = path.join(cwd, sessionPath);
  const round = {
    number: 1, startedAt: '2026-11-12T10:00:00.000Z', completedAt: '2026-11-12T10:01:00.000Z',
    prompt: 'Assess the complete artifact for correctness and evidence.', inputFiles: [],
    requestedModel: 'openai/gpt-test', reportedModel: 'openai/gpt-actual',
    status: 'ok', stopReason: 'stop', result: 'Score: 7/10\nVerdict: ready', error: null,
  };
  const session = { schemaVersion: 1, threadId, model: 'openai/gpt-test', history: [], rounds: [round] };
  const write = async (payload = session) => {
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, JSON.stringify(payload));
  };
  await write();
  const evaluate = (extra = {}) => evaluateReviewGate({
    sessionPath, cwd, scopeComplete: true, ...extra,
  });
  return { cwd, sessionPath, absolute, round, session, write, evaluate };
}

test('native gate consumes the real reviewer session format and latest round', async t => {
  const s = await setup(t);
  const first = await runReviewSession({
    project: s.cwd, prompt: 'Review', requestedModel: 'openai/gpt-test',
    complete: async () => ({ provider: 'openai', model: 'gpt-actual', stopReason: 'stop',
      content: [{ type: 'text', text: 'Score: 6/10\nVerdict: almost' }] }),
  });
  const sessionPath = `.aris/reviewer-sessions/${first.threadId}.json`;
  const positive = await s.evaluate({ sessionPath });
  assert.equal(positive.decision, 'stop');
  assert.equal(positive.acceptance_status, 'accepted');
  assert.equal(positive.reviewer_model, 'openai/gpt-actual');
  await runReviewSession({
    project: s.cwd, threadId: first.threadId, prompt: 'Re-review', requestedModel: 'openai/gpt-test',
    complete: async () => { throw new Error('offline'); },
  });
  assert.equal((await s.evaluate({ sessionPath })).decision, 'review_unavailable');
});

test('scope confirmation identifies the latest saved request, files and reviewed versions', async t => {
  const s = await setup(t);
  const snapshot = 'Reviewed artifact version 2';
  const sha256 = createHash('sha256').update(snapshot).digest('hex');
  s.round.number = 2;
  s.round.prompt = 'Review version 2: methodology, baselines and all reported results.';
  s.round.inputFiles = [{ path: 'reports/final.md', sha256, content: snapshot }];
  s.round.result = 'Score: 7/10\nVerdict: ready\nScope limit: no visual PDF inspection.';
  s.session.rounds.unshift({ ...s.round, number: 1, prompt: 'OLD REQUEST',
    inputFiles: [{ path: 'old.md', sha256, content: snapshot }] });
  await s.write();
  let shown;
  const result = await tool.execute('gate', { sessionPath: s.sessionPath, reviewScopeComplete: true },
    undefined, undefined, {
      cwd: s.cwd, hasUI: true, model: { provider: 'anthropic', id: 'claude-test' },
      ui: { confirm: async (title, message) => {
        shown = { title, message };
        return true;
      } },
    });
  assert.equal(shown?.title, 'Confirm Reviewer Scope');
  for (const text of [s.absolute, threadId, 'Round: 2', 'openai/gpt-actual',
    s.round.completedAt, s.round.prompt, 'reports/final.md', sha256,
    'no visual PDF inspection', 'snapshot', 'current working tree']) {
    assert.ok(shown.message.includes(text), `confirmation omitted ${text}`);
  }
  assert.doesNotMatch(shown.message, /OLD REQUEST|old\.md/);
  assert.equal(result.details.decision, 'stop');
});

test('scope confirmation explicitly identifies prompt-only reviews', async t => {
  const s = await setup(t);
  let message;
  await tool.execute('gate', { sessionPath: s.sessionPath, reviewScopeComplete: true },
    undefined, undefined, {
      cwd: s.cwd, hasUI: true, model: { provider: 'anthropic', id: 'claude-test' },
      ui: { confirm: async (_title, text) => { message = text; return false; } },
    });
  assert.match(message, /No file snapshots.*prompt-only/i);
});

test('Pi TUI confirmation exposes long saved evidence in a scrollable view', async t => {
  const s = await setup(t);
  s.round.prompt = Array.from({ length: 80 }, (_, i) => `Review requirement ${i}`).join('\n');
  await s.write();
  let customShown = false;
  let top, bottom;
  const result = await tool.execute('gate', { sessionPath: s.sessionPath, reviewScopeComplete: true },
    undefined, undefined, {
      cwd: s.cwd, hasUI: true, model: { provider: 'anthropic', id: 'claude-test' },
      ui: { custom: async factory => {
        customShown = true;
        let answer;
        const view = factory({ terminal: { rows: 16 }, requestRender() {} }, {}, {}, value => { answer = value; });
        top = view.render(100).join('\n');
        view.handleInput('\u001b[F');
        bottom = view.render(100).join('\n');
        view.handleInput('\r');
        view.dispose();
        return answer;
      } },
    });
  assert.equal(customShown, true);
  assert.match(top, /Confirm Reviewer Scope/);
  assert.match(bottom, /entire intended scope/);
  assert.equal(result.details.decision, 'stop');
});

test('RPC UI falls back to native confirmation only when custom UI is unsupported', async t => {
  const s = await setup(t);
  for (const [customResult, expected, expectedFallbacks] of [
    [undefined, 'stop', 1], [false, 'review_unavailable', 0], [true, 'stop', 0],
  ]) {
    let confirmations = 0;
    let shown;
    const result = await tool.execute('gate', { sessionPath: s.sessionPath, reviewScopeComplete: true },
      undefined, undefined, {
        cwd: s.cwd, hasUI: true, model: { provider: 'anthropic', id: 'claude-test' },
        ui: {
          custom: async () => customResult,
          confirm: async (_title, message) => { confirmations++; shown = message; return true; },
        },
      });
    assert.equal(result.details.decision, expected);
    assert.equal(confirmations, expectedFallbacks);
    if (expectedFallbacks) assert.ok(shown.includes(s.round.prompt));
  }
});

test('unreadable sessions and missing or corrupt scope evidence never ask for confirmation', async t => {
  const s = await setup(t);
  let confirmations = 0;
  const ctx = {
    cwd: s.cwd, hasUI: true, model: { provider: 'anthropic', id: 'claude-test' },
    ui: { confirm: async () => { confirmations++; return true; } },
  };
  for (const patch of [
    { prompt: undefined }, { prompt: '' }, { inputFiles: undefined }, { inputFiles: [null] },
    { inputFiles: [{ path: 'report.md', sha256: 'a'.repeat(64), content: 'mismatched snapshot' }] },
  ]) {
    await s.write({ ...s.session, rounds: [{ ...s.round, ...patch }] });
    const result = await tool.execute('gate', { sessionPath: s.sessionPath, reviewScopeComplete: true },
      undefined, undefined, ctx);
    assert.equal(result.details.decision, 'review_unavailable');
  }
  const result = await tool.execute('gate', { sessionPath: 'missing.json', reviewScopeComplete: true },
    undefined, undefined, ctx);
  assert.equal(result.details.decision, 'review_unavailable');
  assert.equal(confirmations, 0);
});

test('scope approval cannot be reused for a session changed while the dialog was open', async t => {
  const s = await setup(t);
  const result = await tool.execute('gate', { sessionPath: s.sessionPath, reviewScopeComplete: true },
    undefined, undefined, {
      cwd: s.cwd, hasUI: true, model: { provider: 'anthropic', id: 'claude-test' },
      ui: { confirm: async () => {
        s.session.rounds.push({ ...s.round, number: 2, prompt: 'Different scope and version' });
        await s.write();
        return true;
      } },
    });
  assert.equal(result.details.decision, 'review_unavailable');
  assert.match(result.details.reason, /changed.*confirmation/i);
});

test('gate decisions expose only the review outcome without model assurance fields', async t => {
  const s = await setup(t);
  for (const [text, want] of [
    ['Score: 6/10\nVerdict: ready', 'stop'], ['Score: 10/10\nVerdict: almost', 'stop'],
    ['Score: 5.9/10\nVerdict: ready', 'continue'], ['Score: 10/10\nVerdict: not ready', 'continue'],
  ]) {
    s.round.result = text;
    await s.write();
    const result = await s.evaluate();
    assert.equal(result.decision, want);
    assert.equal(result.next_backend, want === 'stop' ? null : 'pi');
    assert.equal(Object.hasOwn(result, 'review_independence'), false);
    assert.equal(Object.hasOwn(result, 'identity_assurance'), false);
  }
});

test('missing, malformed, conflicting or incomplete records fail closed', async t => {
  const s = await setup(t);
  for (const payload of [null, [], {}, { ...s.session, schemaVersion: 2 },
    { ...s.session, threadId: 'other' }, { ...s.session, rounds: [] },
    { ...s.session, rounds: [null] }, { ...s.session, rounds: [42] },
    ...[
      { status: 'pending' }, { status: 'aborted' }, { status: 'error' },
      { stopReason: 'length' }, { error: 'failure' }, { result: null },
      { result: 'Score: 8/10\nVerdict: ready\nVerdict: not ready' },
      { result: 'Score: 11/10\nVerdict: ready' },
    ].map(change => ({ ...s.session, rounds: [{ ...s.round, ...change }] })),
  ]) {
    await s.write(payload);
    const result = await s.evaluate();
    assert.equal(result.decision, 'review_unavailable', JSON.stringify(payload));
    assert.equal(Object.hasOwn(result, 'review_independence'), false);
    assert.equal(Object.hasOwn(result, 'identity_assurance'), false);
  }
  await fs.writeFile(s.absolute, '{broken');
  assert.equal((await s.evaluate()).decision, 'review_unavailable');
  assert.equal((await s.evaluate({ sessionPath: 'missing.json' })).decision, 'review_unavailable');
});

test('reviewer model metadata never blocks an otherwise valid saved review', async t => {
  const s = await setup(t);
  for (const patch of [
    { reportedModel: null }, { reportedModel: undefined, requestedModel: undefined },
    { reportedModel: 'custom/opaque' }, { reportedModel: '__proto__/opaque' },
    { reportedModel: 42 }, { requestedModel: 'other/model' },
  ]) {
    await s.write({ ...s.session, model: undefined, rounds: [{ ...s.round, ...patch }] });
    assert.equal((await s.evaluate()).decision, 'stop', JSON.stringify(patch));
  }
  assert.equal((await s.evaluate({ scopeComplete: false })).decision, 'review_unavailable');
});

test('native tool does not inspect executor identity and still requires actual UI confirmation', async t => {
  const s = await setup(t);
  assert.equal(Value.Check(tool.parameters, { sessionPath: s.sessionPath, executorModel: 'google/gemini' }), false);
  assert.equal(Value.Check(tool.parameters, { sessionPath: '' }), false);
  const run = async ({ hasUI = true, confirm = async () => true, model = { provider: 'anthropic', id: 'claude-test' }, flag = true } = {}) => {
    const result = await tool.execute('gate', {
      sessionPath: s.sessionPath, reviewScopeComplete: flag,
    }, undefined, undefined, { cwd: s.cwd, hasUI, model, ui: { confirm } });
    assert.deepEqual(JSON.parse(result.content[0].text), result.details);
    return result.details;
  };
  assert.equal((await run()).decision, 'stop');
  for (const model of [null, { provider: 'openai', id: 'gpt-other' }, { provider: 'custom', id: 'opaque' }]) {
    assert.equal((await run({ model })).decision, 'stop');
  }
  await s.write({ ...s.session, model: undefined,
    rounds: [{ ...s.round, requestedModel: undefined, reportedModel: null }] });
  const result = await tool.execute('gate', { sessionPath: s.sessionPath, reviewScopeComplete: true },
    undefined, undefined, {
      cwd: s.cwd, hasUI: true, get model() { throw new Error('gate must not read executor model'); },
      ui: { confirm: async () => true },
    });
  assert.equal(result.details.decision, 'stop');
  assert.equal(result.details.reviewer_model, null);
  for (const options of [
    { hasUI: false, confirm: async () => { assert.fail('headless confirmation'); } },
    { flag: false, confirm: async () => { assert.fail('unrequested confirmation'); } },
    { confirm: async () => false }, { confirm: async () => { throw new Error('UI unavailable'); } },
  ]) assert.equal((await run(options)).decision, 'review_unavailable');
});

test('assessment accepts bullet markers and rejects absent, duplicate and out-of-range scores', () => {
  assert.deepEqual(parseAssessment('- Score: 8.5 / 10\n* Verdict: NOT READY'), { score: 8.5, verdict: 'not ready' });
  for (const text of ['', 'Score: 0/10\nVerdict: ready', 'Score: 11/10\nVerdict: almost',
    'Score: 7/10\nScore: 8/10\nVerdict: ready', 'Score: 7/10\nVerdict: okay']) {
    assert.throws(() => parseAssessment(text));
  }
});
