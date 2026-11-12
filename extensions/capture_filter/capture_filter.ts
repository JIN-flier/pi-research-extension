/** 原生 TypeScript 实现；保持旧 Python helper 的存储格式和操作语义。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** 只匹配带 ARIS 基础设施限定的工具名；避免把针对普通模型的研究发现误判成运维抱怨。 */
const TOOL = String.raw`(?:codex[ -](?:mcp|cli|reviewer)|oracle[ -](?:mcp|pro|reviewer)|gemini[ -](?:mcp|cli|review|reviewer)|manual[ -]review|mcp server|reviewer mcp|the reviewer backend|wandb)`;
/** 确定性规则分为环境故障、瞬时错误和工具负面能力断言；顺序决定原因码的返回顺序。 */
const PATTERNS: [RegExp, string][] = [
  [/\bcommand not found\b/i, 'env_failure'], [/\bNo such file or directory\b/i, 'env_failure'],
  [/\bNo module named\b/i, 'env_failure'], [/\bModuleNotFoundError\b/, 'env_failure'],
  [/\bImportError\b/, 'env_failure'], [/\bPermission denied\b/i, 'env_failure'],
  [/\bconnection (refused|timed out|reset)\b/i, 'transient_error'],
  [/\b(rate limit|429|quota exceeded|503|502|temporarily unavailable)\b/i, 'transient_error'],
  [/\bCUDA out of memory\b|\bOOM\b/i, 'transient_error'],
  [new RegExp(`${TOOL}\\s+(?:can'?t|cannot|is unable to|does(?:n'?t| not))\\s+`, 'i'), 'negative_tool_claim'],
  [new RegExp(`${TOOL}\\s+(?:is|are|was|were)\\s+(?:broken|down|useless|unusable|buggy)\\b`, 'i'), 'negative_tool_claim'],
  [new RegExp(`${TOOL}\\s+always\\s+(?:fails|crashes|hangs|errors)\\b`, 'i'), 'negative_tool_claim'],
  [new RegExp(`\\b(?:don'?t|do not|never)\\s+use\\s+(?:the\\s+|a\\s+)?${TOOL}`, 'i'), 'negative_tool_claim'],
];
/** 原因码对应的用户说明；通过筛查只表示未命中机械规则，不代表结论已验证。 */
const DETAILS: Record<string, string> = {
  env_failure: "looks like an environment-specific failure (missing binary/module/path /permission) — transient state, not a durable fact. Store HOW TO FIX or the missing config, never 'X failed'.",
  transient_error: 'looks like a transient error (rate limit / OOM / network) that self-resolves — do not capture it as a durable rule.',
  negative_tool_claim: "looks like a negative capability claim about ARIS's own tooling ('X can't / is broken'). These harden into self-cited refusals long after the real problem was fixed. Store the fix / the workaround, not 'X can't do Y'.",
};
/** 返回去重的原因码；同一类别多条规则命中时只返回一次，不修改输入文本。 */
export function screen(content: string): string[] {
  const found: string[] = [];
  for (const [regex, reason] of PATTERNS) if (!found.includes(reason) && regex.test(content)) found.push(reason);
  return found;
}
/** 解释已知原因码；未知码原样返回，便于调用方保留诊断信息。 */
export function reasonDetail(reason: string): string { return DETAILS[reason] ?? reason; }
/** 注册内容或文件筛查入口；content 优先于 path，命中规则按旧 CLI 非零退出语义返回 isError。 */
export default function register(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'capture_filter', label: 'Capture Filter',
    description: 'Screen proposed durable research memory for transient tool/environment errors and negative ARIS tool claims.',
    parameters: Type.Object({ content: Type.Optional(Type.String()), path: Type.Optional(Type.String()) }, { additionalProperties: false }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        if (params.content === undefined && !params.path) throw new Error('Provide content or path');
        const content = params.content ?? await fs.readFile(path.resolve(ctx.cwd, params.path!), 'utf8');
        const reasons = screen(content), rejected = reasons.length > 0;
        return { content: [{ type: 'text' as const, text: rejected ? `DO-NOT-CAPTURE: ${reasons.join(', ')}\n${reasons.map(r => `  - ${r}: ${reasonDetail(r)}`).join('\n')}` : 'ok to capture (mechanical screen clean)' }], details: { reasons }, ...(rejected ? { isError: true } : {}) };
      } catch (error) { return { content: [{ type: 'text' as const, text: `ERROR: ${String(error)}` }], details: { reasons: [] }, isError: true }; }
    },
  });
}
