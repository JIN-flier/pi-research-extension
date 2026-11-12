import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runReviewSession } from '../extensions/aris-reviewer/review-session-manager.ts';

async function projectForTest(t) {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'aris-review-'));
  t.after(() => fs.rm(project, { recursive: true, force: true }));
  return project;
}

async function savedSession(project, threadId) {
  return JSON.parse(await fs.readFile(path.join(project, '.aris', 'reviewer-sessions', `${threadId}.json`), 'utf8'));
}

test('review record saves actual model, input snapshot, result, and thread ID', async t => {
  const project = await projectForTest(t);
  await fs.writeFile(path.join(project, 'dossier.md'), 'Paper DOI: 10.1234/one\n');
  let received;
  const result = await runReviewSession({
    project, prompt: 'Assess novelty', files: ['dossier.md'], requestedModel: 'openai/gpt-test',
    complete: async prompt => {
      received = prompt;
      return { provider: 'openai', model: 'gpt-actual', stopReason: 'stop', content: [{ type: 'text', text: 'Proceed with caution' }] };
    },
  });
  assert.equal(result.status, 'ok');
  assert.match(result.threadId, /^[0-9a-f-]{36}$/i);
  assert.match(received, /Paper DOI: 10\.1234\/one/);
  const record = await savedSession(project, result.threadId);
  assert.equal(record.threadId, result.threadId);
  assert.equal(record.model, 'openai/gpt-test');
  assert.equal(record.rounds.length, 1);
  assert.equal(record.rounds[0].requestedModel, 'openai/gpt-test');
  assert.equal(record.rounds[0].reportedModel, 'openai/gpt-actual');
  assert.equal(record.rounds[0].status, 'ok');
  assert.equal(record.rounds[0].result, 'Proceed with caution');
  assert.equal(record.rounds[0].error, null);
  assert.equal(record.rounds[0].inputFiles[0].path, 'dossier.md');
  assert.equal(record.rounds[0].inputFiles[0].content, 'Paper DOI: 10.1234/one\n');
  assert.match(record.rounds[0].inputFiles[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(record.history.length, 2);
});

test('follow-up uses saved thread history and appends a second review round', async t => {
  const project = await projectForTest(t);
  const first = await runReviewSession({
    project, prompt: 'First question', requestedModel: 'openai/gpt-test',
    complete: async () => ({ provider: 'openai', model: 'gpt-actual', stopReason: 'stop', content: [{ type: 'text', text: 'First answer' }] }),
  });
  let secondPrompt;
  const second = await runReviewSession({
    project, threadId: first.threadId, prompt: 'Follow-up', requestedModel: 'openai/gpt-test',
    complete: async prompt => {
      secondPrompt = prompt;
      return { provider: 'openai', model: 'gpt-actual', stopReason: 'stop', content: [{ type: 'text', text: 'Second answer' }] };
    },
  });
  assert.equal(second.threadId, first.threadId);
  assert.match(secondPrompt, /First question/);
  assert.match(secondPrompt, /First answer/);
  assert.match(secondPrompt, /Follow-up/);
  const record = await savedSession(project, first.threadId);
  assert.deepEqual(record.rounds.map(round => round.result), ['First answer', 'Second answer']);
  assert.equal(record.history.length, 4);
});

test('separate thread IDs isolate reviewer history even when using the same model', async t => {
  const project = await projectForTest(t);
  const answer = text => ({ provider: 'openai', model: 'gpt-test', stopReason: 'stop',
    content: [{ type: 'text', text }] });
  const first = await runReviewSession({
    project, prompt: 'TASK_A_INITIAL', requestedModel: 'openai/gpt-test',
    complete: async () => answer('TASK_A_REVIEW'),
  });
  let newThreadPrompt;
  const second = await runReviewSession({
    project, prompt: 'TASK_B_INITIAL', requestedModel: 'openai/gpt-test',
    complete: async prompt => { newThreadPrompt = prompt; return answer('TASK_B_REVIEW'); },
  });
  assert.notEqual(first.threadId, second.threadId);
  assert.doesNotMatch(newThreadPrompt, /TASK_A/);
  let followUpPrompt;
  await runReviewSession({
    project, threadId: first.threadId, prompt: 'TASK_A_REVISION', requestedModel: 'openai/gpt-test',
    complete: async prompt => { followUpPrompt = prompt; return answer('TASK_A_FOLLOWUP'); },
  });
  assert.match(followUpPrompt, /TASK_A_INITIAL/);
  assert.match(followUpPrompt, /TASK_A_REVIEW/);
  assert.doesNotMatch(followUpPrompt, /TASK_B/);
  const other = await savedSession(project, second.threadId);
  assert.deepEqual(other.history, [
    { role: 'user', text: 'TASK_B_INITIAL' }, { role: 'assistant', text: 'TASK_B_REVIEW' },
  ]);
});

test('failed review is recorded and retry retains the same thread without false history', async t => {
  const project = await projectForTest(t);
  const failed = await runReviewSession({
    project, prompt: 'Review this', requestedModel: 'openai/gpt-test',
    complete: async () => { throw new Error('provider unavailable'); },
  });
  assert.equal(failed.status, 'error');
  let record = await savedSession(project, failed.threadId);
  assert.equal(record.rounds[0].status, 'error');
  assert.match(record.rounds[0].error, /provider unavailable/);
  assert.equal(record.rounds[0].result, null);
  assert.equal(record.rounds[0].reportedModel, null);
  assert.deepEqual(record.history, []);

  const retry = await runReviewSession({
    project, threadId: failed.threadId, prompt: 'Retry', requestedModel: 'openai/gpt-test',
    complete: async prompt => {
      assert.doesNotMatch(prompt, /Review this/);
      return { provider: 'openai', model: 'gpt-actual', stopReason: 'stop', content: [{ type: 'text', text: 'Recovered' }] };
    },
  });
  assert.equal(retry.status, 'ok');
  record = await savedSession(project, failed.threadId);
  assert.deepEqual(record.rounds.map(round => round.status), ['error', 'ok']);
  assert.equal(record.history.length, 2);
});

test('continuation rejects a changed reviewer model', async t => {
  const project = await projectForTest(t);
  const first = await runReviewSession({
    project, prompt: 'First', requestedModel: 'openai/gpt-test',
    complete: async () => ({ provider: 'openai', model: 'gpt-actual', stopReason: 'stop', content: [{ type: 'text', text: 'Answer' }] }),
  });
  await assert.rejects(runReviewSession({
    project, threadId: first.threadId, prompt: 'Second', requestedModel: 'anthropic/claude-test',
    complete: async () => { throw new Error('should not be called'); },
  }), /Reviewer model changed/);
});

test('response without actual model identity is retained but cannot complete a review', async t => {
  const project = await projectForTest(t);
  const result = await runReviewSession({
    project, prompt: 'Check this', requestedModel: 'openai/gpt-test',
    complete: async () => ({ stopReason: 'stop', content: [{ type: 'text', text: 'A verdict' }] }),
  });
  assert.equal(result.status, 'error');
  const record = await savedSession(project, result.threadId);
  assert.equal(record.rounds[0].result, 'A verdict');
  assert.equal(record.rounds[0].reportedModel, null);
  assert.match(record.rounds[0].error, /model identity/);
  assert.deepEqual(record.history, []);
});

test('response from a different actual model is recorded without advancing the thread', async t => {
  const project = await projectForTest(t);
  const first = await runReviewSession({
    project, prompt: 'First', requestedModel: 'openai/gpt-test',
    complete: async () => ({ provider: 'openai', model: 'gpt-a', stopReason: 'stop', content: [{ type: 'text', text: 'First answer' }] }),
  });
  const changed = await runReviewSession({
    project, threadId: first.threadId, prompt: 'Second', requestedModel: 'openai/gpt-test',
    complete: async () => ({ provider: 'openai', model: 'gpt-b', stopReason: 'stop', content: [{ type: 'text', text: 'Second answer' }] }),
  });
  assert.equal(changed.status, 'error');
  const record = await savedSession(project, first.threadId);
  assert.equal(record.rounds[1].reportedModel, 'openai/gpt-b');
  assert.equal(record.rounds[1].result, 'Second answer');
  assert.match(record.rounds[1].error, /actual reviewer model changed/);
  assert.equal(record.history.length, 2);
});

test('aborted response keeps error status and partial result', async t => {
  const project = await projectForTest(t);
  const result = await runReviewSession({
    project, prompt: 'Review', requestedModel: 'openai/gpt-test',
    complete: async () => ({ provider: 'openai', model: 'gpt-a', stopReason: 'aborted', content: [{ type: 'text', text: 'Partial' }] }),
  });
  assert.equal(result.status, 'aborted');
  const record = await savedSession(project, result.threadId);
  assert.equal(record.rounds[0].status, 'aborted');
  assert.equal(record.rounds[0].result, 'Partial');
  assert.deepEqual(record.history, []);
});

test('truncated response is recorded without becoming a successful review', async t => {
  const project = await projectForTest(t);
  const result = await runReviewSession({
    project, prompt: 'Review', requestedModel: 'openai/gpt-test',
    complete: async () => ({ provider: 'openai', model: 'gpt-a', stopReason: 'length', content: [{ type: 'text', text: 'Incomplete verdict' }] }),
  });
  assert.equal(result.status, 'error');
  const record = await savedSession(project, result.threadId);
  assert.equal(record.rounds[0].stopReason, 'length');
  assert.equal(record.rounds[0].result, 'Incomplete verdict');
  assert.deepEqual(record.history, []);
});
