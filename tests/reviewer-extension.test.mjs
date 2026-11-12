import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import registerReviewer from '../extensions/aris-reviewer/aris-reviewer.ts';

const models = [
  { provider: 'openai', id: 'gpt-test-large', name: 'Large reviewer' },
  { provider: 'openai', id: 'gpt-test', name: 'Test reviewer' },
  { provider: 'custom', id: 'org/reviewer', name: 'Custom reviewer' },
];

test('reviewer exposes the installed package root after moving into a subdirectory', () => {
  const previous = process.env.ARIS_REPO;
  try {
    delete process.env.ARIS_REPO;
    registerReviewer({ registerCommand() {}, registerTool() {} });
    assert.equal(process.env.ARIS_REPO, path.resolve(import.meta.dirname, '..'));
  } finally {
    if (previous === undefined) delete process.env.ARIS_REPO;
    else process.env.ARIS_REPO = previous;
  }
});

async function setup(t, available = models) {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'aris-extension-'));
  t.after(() => fs.rm(project, { recursive: true, force: true }));
  const commands = new Map();
  let tool;
  registerReviewer({
    registerCommand: (name, definition) => commands.set(name, definition),
    registerTool: definition => { tool = definition; },
  });
  const notifications = [];
  const ctx = {
    cwd: project,
    hasUI: false,
    ui: {
      notify: (text, level) => notifications.push({ text, level }),
      select: async () => { assert.fail('A headless command must not open a picker'); },
    },
    modelRegistry: {
      getAvailable: () => available,
      find: (provider, id) => available.find(m => m.provider === provider && m.id === id),
      hasConfiguredAuth: () => true,
      complete: async () => { assert.fail('Unexpected provider call'); },
    },
  };
  const configPath = path.join(project, '.aris', 'reviewer.json');
  return {
    ctx, project, configPath, commands, tool, notifications,
    pick: args => commands.get('aris-reviewer-picker').handler(args, ctx),
    writeConfig: async config => {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config));
    },
    readConfig: async () => JSON.parse(await fs.readFile(configPath, 'utf8')),
  };
}

test('picker prefers an exact model reference over a partial match and writes provider/id', async t => {
  const s = await setup(t);
  await s.pick('openai/gpt-test');
  assert.deepEqual(await s.readConfig(), { provider: 'openai', id: 'gpt-test' });
});

test('picker supports a unique case-insensitive name search without UI', async t => {
  const s = await setup(t);
  await s.pick('CUSTOM REVIEWER');
  assert.deepEqual(await s.readConfig(), { provider: 'custom', id: 'org/reviewer' });
});

test('ambiguous headless search preserves the current configuration', async t => {
  const s = await setup(t);
  await s.writeConfig({ provider: 'custom', id: 'org/reviewer' });
  await s.pick('gpt-test');
  assert.deepEqual(await s.readConfig(), { provider: 'custom', id: 'org/reviewer' });
  assert.equal(s.notifications.at(-1).level, 'error');
  assert.match(s.notifications.at(-1).text, /openai\/gpt-test-large/);
  assert.match(s.notifications.at(-1).text, /openai\/gpt-test/);
});

test('interactive search offers all matching models and saves the user selection', async t => {
  const s = await setup(t);
  s.ctx.hasUI = true;
  s.ctx.ui.select = async (_title, options) => {
    assert.equal(options.length, 2);
    assert.ok(options.every(option => option.startsWith('openai/')));
    return options[1];
  };
  await s.pick('gpt-test');
  assert.deepEqual(await s.readConfig(), { provider: 'openai', id: 'gpt-test' });
});

test('interactive picker without arguments lists all models and permits cancellation', async t => {
  const s = await setup(t);
  await s.writeConfig({ provider: 'openai', id: 'gpt-test' });
  s.ctx.hasUI = true;
  s.ctx.ui.select = async (_title, options) => {
    assert.equal(options.length, 3);
    return undefined;
  };
  await s.pick('');
  assert.deepEqual(await s.readConfig(), { provider: 'openai', id: 'gpt-test' });
  assert.deepEqual(s.notifications, []);
});

test('headless picker without arguments explains how to provide a model', async t => {
  const s = await setup(t);
  await s.pick('');
  assert.equal(s.notifications.at(-1).level, 'error');
  assert.match(s.notifications.at(-1).text, /\/aris-reviewer-picker/);
  await assert.rejects(fs.access(s.configPath), { code: 'ENOENT' });
});

test('empty model catalogue and unmatched search report errors without writing config', async t => {
  for (const available of [[], models]) {
    const s = await setup(t, available);
    await s.pick('missing');
    assert.equal(s.notifications.at(-1).level, 'error');
    await assert.rejects(fs.access(s.configPath), { code: 'ENOENT' });
  }
});

test('picker reports a configuration write failure through the UI', async t => {
  const s = await setup(t);
  await fs.writeFile(path.join(s.project, '.aris'), 'not a directory');
  await assert.doesNotReject(s.pick('openai/gpt-test'));
  assert.equal(s.notifications.at(-1).level, 'error');
});

test('picker replaces a legacy reviewer configuration with provider/id', async t => {
  const s = await setup(t);
  await s.writeConfig({ backend: 'pi', model: 'openai/gpt-test' });
  await s.pick('custom/org/reviewer');
  assert.deepEqual(await s.readConfig(), { provider: 'custom', id: 'org/reviewer' });
});

test('ARIS_REPO cannot redirect project reviewer config or session storage', async t => {
  const s = await setup(t);
  const otherProject = await fs.mkdtemp(path.join(os.tmpdir(), 'aris-other-project-'));
  t.after(() => fs.rm(otherProject, { recursive: true, force: true }));
  const previous = process.env.ARIS_REPO;
  process.env.ARIS_REPO = otherProject;
  t.after(() => {
    if (previous === undefined) delete process.env.ARIS_REPO;
    else process.env.ARIS_REPO = previous;
  });
  await fs.mkdir(path.join(otherProject, '.aris'));
  const otherConfig = path.join(otherProject, '.aris', 'reviewer.json');
  await fs.writeFile(otherConfig, '{"provider":"openai","id":"gpt-test"}');
  await s.pick('custom/org/reviewer');
  s.ctx.modelRegistry.complete = async model => {
    assert.equal(model.provider, 'custom');
    assert.equal(model.id, 'org/reviewer');
    return {
      provider: 'custom', model: 'org/reviewer', stopReason: 'stop',
      content: [{ type: 'text', text: 'Local project review' }],
    };
  };
  const result = await s.tool.execute('call', { prompt: 'Review' }, undefined, undefined, s.ctx);
  assert.equal(result.isError, undefined);
  assert.deepEqual(await s.readConfig(), { provider: 'custom', id: 'org/reviewer' });
  assert.deepEqual(JSON.parse(await fs.readFile(otherConfig, 'utf8')), { provider: 'openai', id: 'gpt-test' });
  await fs.access(path.join(s.project, '.aris', 'reviewer-sessions', `${result.details.threadId}.json`));
  await assert.rejects(fs.access(path.join(otherProject, '.aris', 'reviewer-sessions')), { code: 'ENOENT' });
});

test('review uses only configured provider/id, forwards cancellation, and records the actual model', async t => {
  const s = await setup(t);
  await s.writeConfig({ provider: 'custom', id: 'org/reviewer' });
  assert.equal('model' in s.tool.parameters.properties, false);
  const signal = new AbortController().signal;
  s.ctx.modelRegistry.complete = async (model, context, options) => {
    assert.equal(model.provider, 'custom');
    assert.equal(model.id, 'org/reviewer');
    assert.match(context.messages[0].content[0].text, /Review my evidence/);
    assert.equal(options.signal, signal);
    assert.equal(options.cacheRetention, 'none');
    return {
      provider: 'custom', model: 'org/reviewer', stopReason: 'stop',
      content: [{ type: 'text', text: 'Review result' }],
    };
  };
  const result = await s.tool.execute('call', {
    prompt: 'Review my evidence', model: 'openai/gpt-test',
  }, signal, undefined, s.ctx);
  assert.equal(result.isError, undefined);
  assert.equal(result.details.requestedModel, 'custom/org/reviewer');
  assert.match(result.content[0].text, /Reviewer-Model: custom\/org\/reviewer/);
  const session = JSON.parse(await fs.readFile(path.join(
    s.project, '.aris', 'reviewer-sessions', `${result.details.threadId}.json`,
  ), 'utf8'));
  assert.equal(session.rounds[0].status, 'ok');
  assert.equal(session.rounds[0].reportedModel, 'custom/org/reviewer');
});

test('invalid reviewer config returns an actionable error before any provider call', async t => {
  for (const config of [null, [], {}, 42, 'model', { provider: 42, id: 'gpt-test' },
    { provider: 'openai', id: '' }, { provider: ' ', id: 'gpt-test' },
    { provider: 'openai/provider', id: 'gpt-test' }, { provider: 'openai', id: ' gpt-test' },
    { provider: 'openai\n', id: 'gpt-test' }, { provider: 'openai', id: 'gpt-test\n' },
    { provider: 'openai', id: 42 }, { backend: 'pi', model: 'openai/gpt-test' }]) {
    const s = await setup(t);
    await s.writeConfig(config);
    const result = await s.tool.execute('call', { prompt: 'Review' }, undefined, undefined, s.ctx);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /\/aris-reviewer-picker/);
    await assert.rejects(fs.access(path.join(s.project, '.aris', 'reviewer-sessions')), { code: 'ENOENT' });
  }
});

test('missing and malformed config produce distinct actionable errors', async t => {
  const s = await setup(t);
  const missing = await s.tool.execute('call', { prompt: 'Review' }, undefined, undefined, s.ctx);
  assert.equal(missing.isError, true);
  await s.writeConfig({});
  await fs.writeFile(s.configPath, '{broken');
  const malformed = await s.tool.execute('call', { prompt: 'Review' }, undefined, undefined, s.ctx);
  assert.equal(malformed.isError, true);
  assert.notEqual(missing.content[0].text, malformed.content[0].text);
  assert.match(malformed.content[0].text, /\/aris-reviewer-picker/);
});

test('unavailable and unauthenticated configured models cannot start a review', async t => {
  for (const config of [
    { provider: 'unknown', id: 'unknown' }, { provider: 'openai', id: 'gpt-test' },
  ]) {
    const s = await setup(t);
    await s.writeConfig(config);
    s.ctx.modelRegistry.hasConfiguredAuth = () => false;
    const result = await s.tool.execute('call', { prompt: 'Review' }, undefined, undefined, s.ctx);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /unavailable or authentication missing/);
    assert.match(result.content[0].text, new RegExp(`${config.provider}/${config.id}`));
  }
});
