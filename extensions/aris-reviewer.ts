import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { configureArisRepo, parseModelRef, runReviewSession } from './aris-reviewer-core.mjs';

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
      catch { return { content: [{ type: 'text', text: 'ARIS reviewer unset. Run /aris-reviewer provider/model.' }], details: undefined, isError: true }; }
      if (config.backend !== 'pi') {
        return { content: [{ type: 'text', text: 'ARIS reviewer config must select backend pi.' }], details: undefined, isError: true };
      }
      const selected = params.model ?? config.model;
      if (!selected) return { content: [{ type: 'text', text: 'Choose a reviewer with /aris-reviewer provider/model or pass model.' }], details: undefined, isError: true };
      let pair;
      try { pair = parseModelRef(selected); }
      catch (error) { return { content: [{ type: 'text', text: String(error) }], details: undefined, isError: true }; }
      const model = ctx.modelRegistry.find(pair.provider, pair.id);
      if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) {
        return { content: [{ type: 'text', text: `Model unavailable or API key missing: ${selected}` }], details: undefined, isError: true };
      }
      try {
        const review = await runReviewSession({
          project, prompt: params.prompt, files: params.files ?? [], threadId: params.threadId,
          requestedModel: selected,
          complete: (reviewPrompt: string) => ctx.modelRegistry.complete(model, {
            messages: [{ role: 'user', content: [{ type: 'text', text: reviewPrompt }], timestamp: Date.now() }],
          }, { signal, cacheRetention: 'none' }),
        });
        if (review.status !== 'ok') {
          return {
            content: [{ type: 'text', text: `${review.error}\nthreadId: ${review.threadId}` }],
            details: review, isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: `${review.answer}\n\nReviewer-Model: ${review.reportedModel ?? 'unknown'}\nthreadId: ${review.threadId}` }],
          details: review,
        };
      } catch (error) {
        return { content: [{ type: 'text', text: String(error) }], details: undefined, isError: true };
      }
    },
  });
}
