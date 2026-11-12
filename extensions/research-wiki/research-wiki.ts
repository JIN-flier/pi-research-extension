/** 原生 TypeScript 实现；保持旧 Python helper 的存储格式和操作语义。 */
import path from 'node:path';
import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { runWiki } from './wiki-core.ts';

const OptionalString = Type.Optional(Type.String());
const OptionalList = Type.Optional(Type.Array(Type.String()));
/** 对外动作白名单，覆盖旧 research_wiki CLI 的全部子命令。 */
const Actions = ['init','slug','add_edge','rebuild_query_pack','rebuild_index','stats','log','ingest_paper','add_claim','upsert_idea','add_experiment','sync'] as const;
/** 注册研究 wiki 原生工具。schema 定义可用参数，各动作的必需字段和状态枚举由核心层检查。
 * 路径始终相对 ctx.cwd 解析，防止安装包位置或进程 cwd 改变研究项目的输出位置。 */
export default function register(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'research_wiki', label: 'Research Wiki',
    description: 'Initialize and maintain the project research wiki; ingest papers; write claims, ideas, experiments and typed edges; rebuild derived files and stats.',
    parameters: Type.Object({
      action: Type.Union(Actions.map(a => Type.Literal(a))),
      wikiRoot: OptionalString,
      title: OptionalString, author: OptionalString, authors: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])), year: Type.Optional(Type.Number()),
      arxivId: OptionalString, arxivIds: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])), fromFile: OptionalString,
      doi: OptionalString, venue: OptionalString, thesis: OptionalString, tags: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
      updateOnExist: Type.Optional(Type.Boolean()), name: OptionalString, slug: OptionalString, description: OptionalString,
      status: OptionalString, provenance: OptionalString, statement: OptionalString, scope: OptionalString, evidence: OptionalString,
      addresses: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])), extends: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
      uses: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])), dependsOn: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
      refutes: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])), stage: OptionalString, outcome: OptionalString,
      risks: OptionalString, basedOn: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])), targetGaps: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
      idea: OptionalString, verdict: OptionalString, confidence: OptionalString, date: OptionalString, hardware: OptionalString,
      duration: OptionalString, metrics: OptionalString, reasoning: OptionalString,
      from: OptionalString, to: OptionalString, type: OptionalString, message: OptionalString, maxChars: Type.Optional(Type.Number()),
    }, { additionalProperties: false }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const root = path.resolve(ctx.cwd, params.wikiRoot ?? 'research-wiki');
        const normalized = params.fromFile ? { ...params, fromFile: path.resolve(ctx.cwd, params.fromFile) } : params;
        const output = await runWiki(root, normalized);
        return { content: [{ type: 'text' as const, text: output }], details: { action: params.action, wikiRoot: root } };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `ERROR: ${error instanceof Error ? error.message : String(error)}` }], details: { action: params.action }, isError: true };
      }
    },
  });
}
