import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { configureArisRepo, parseModelRef, safeInputPath, nextHistory } from './aris-reviewer-core.mjs';

type Turn = { role: 'user' | 'assistant'; text: string };
type SavedReview = { model: string; history: Turn[] };

export default function (pi: ExtensionAPI) {
  configureArisRepo(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  pi.registerCommand('aris-reviewer', {
    description: 'Select the API-key-backed model for ARIS reviews: /aris-reviewer provider/model',
    handler: async (args, ctx) => {
      const reference = args.trim();
      if (!reference) {
        ctx.ui.notify('Use /aris-reviewer provider/model. Browse models with /model first.', 'info');
        return;
      }
      let pair;
      try { pair = parseModelRef(reference); }
      catch (error) { ctx.ui.notify(String(error), 'error'); return; }
      const model = ctx.modelRegistry.find(pair.provider, pair.id);
      if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) {
        ctx.ui.notify(`Model unavailable or API key missing: ${reference}`, 'error');
        return;
      }
      const directory = path.join(ctx.cwd, '.aris');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'reviewer.json'), JSON.stringify({ backend: 'pi', model: reference }, null, 2) + '\n');
      ctx.ui.notify(`ARIS reviewer: ${reference}`, 'info');
    },
  });

  pi.registerTool({
    name: 'aris_review',
    label: 'ARIS Review',
    description: 'Run or continue an ARIS external review using the selected Pi provider/model API key. Returns reviewer text and threadId.',
    parameters: Type.Object({
      prompt: Type.String(),
      threadId: Type.Optional(Type.String()),
      model: Type.Optional(Type.String({ description: 'Optional provider/model override for this new review thread' })),
      files: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const project = ctx.cwd;
      const configPath = path.join(project, '.aris', 'reviewer.json');
      let config: { backend?: string; model?: string };
      try { config = JSON.parse(await fs.readFile(configPath, 'utf8')); }
      catch { return { content: [{ type: 'text', text: 'ARIS reviewer unset. Run /aris-reviewer provider/model.' }], isError: true }; }
      if (config.backend !== 'pi') {
        return { content: [{ type: 'text', text: 'ARIS reviewer config must select backend pi.' }], isError: true };
      }
      const selected = params.model ?? config.model;
      if (!selected) return { content: [{ type: 'text', text: 'Choose a reviewer with /aris-reviewer provider/model or pass model.' }], isError: true };
      const pair = parseModelRef(selected);
      const model = ctx.modelRegistry.find(pair.provider, pair.id);
      if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) {
        return { content: [{ type: 'text', text: `Model unavailable or API key missing: ${selected}` }], isError: true };
      }
      const directory = path.join(project, '.aris', 'reviewer-sessions');
      const threadId = params.threadId ?? randomUUID();
      if (!/^[0-9a-f-]{36}$/i.test(threadId)) {
        return { content: [{ type: 'text', text: 'Invalid ARIS review threadId.' }], isError: true };
      }
      let saved: SavedReview = { model: selected, history: [] };
      if (params.threadId) {
        try { saved = JSON.parse(await fs.readFile(path.join(directory, `${threadId}.json`), 'utf8')); }
        catch { return { content: [{ type: 'text', text: 'ARIS review thread not found.' }], isError: true }; }
        if (saved.model !== selected) {
          return { content: [{ type: 'text', text: 'Reviewer model changed; start a new review thread.' }], isError: true };
        }
      }
      const inputs: string[] = [];
      for (const candidate of params.files ?? []) {
        const filename = safeInputPath(project, candidate);
        const real = await fs.realpath(filename);
        safeInputPath(project, real);
        inputs.push(`\n<file path="${candidate}">\n${await fs.readFile(real, 'utf8')}\n</file>`);
      }
      const reviewPrompt = [
        'You are an independent ARIS research reviewer. Assess the supplied evidence and state uncertainty precisely.',
        'Prior review conversation:',
        ...saved.history.map(turn => `${turn.role}: ${turn.text}`),
        'Current review request:', params.prompt, ...inputs,
      ].join('\n\n');
      const response = await ctx.modelRegistry.complete(model, {
        messages: [{ role: 'user', content: [{ type: 'text', text: reviewPrompt }], timestamp: Date.now() }],
      }, { signal, cacheRetention: 'none' });
      if (response.stopReason === 'error' || response.stopReason === 'aborted') {
        return { content: [{ type: 'text', text: `ARIS reviewer failed: ${response.stopReason}` }], isError: true };
      }
      const answer = response.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
      if (!answer.trim()) return { content: [{ type: 'text', text: 'ARIS reviewer returned no text.' }], isError: true };
      saved.history = nextHistory(saved.history, params.prompt + inputs.join(''), answer);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, `${threadId}.json`), JSON.stringify(saved, null, 2) + '\n');
      const reportedModel = response.model ? `${response.provider ?? pair.provider}/${response.model}` : null;
      return {
        content: [{ type: 'text', text: answer + `\n\nReviewer-Model: ${reportedModel ?? 'unknown'}\nthreadId: ${threadId}` }],
        details: { threadId, requestedModel: selected, reportedModel, stopReason: response.stopReason },
      };
    },
  });
}
