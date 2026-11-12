/** 原生 TypeScript 实现；保持旧 Python helper 的存储格式和操作语义。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ingestPaper, type PaperMeta } from '../research-wiki/wiki-core.ts';

type RecordData = Record<string, unknown>;
const object = (v: unknown): v is RecordData => v !== null && typeof v === 'object' && !Array.isArray(v);
/** 生成去重键：DOI 忽略大小写及 _vN，arXiv 忽略 vN；保存到页面的来源标识仍保留原值。 */
export function normalizeId(value: string): string {
  let v = value.trim().toLowerCase();
  if (v.startsWith('arxiv:')) return 'arxiv:' + v.slice(6).replace(/v\d+$/, '');
  if (v.startsWith('doi:')) v = v.slice(4);
  return 'doi:' + v.replace(/_v\d+$/, '');
}
/** 生成来源记录标识，有 DOI 时优先使用 DOI，与旧导入器保持一致。 */
export function recordId(record: RecordData): string {
  return String(record.doi).trim() ? `doi:${String(record.doi).trim().toLowerCase()}` : `arxiv:${String(record.arxiv_id).trim().toLowerCase()}`;
}
/** 校验真实 sidecar 顶层结构，并合并 results 与 dropped.record；不猜测未知格式。 */
export function validatePayload(payload: unknown): RecordData[] {
  if (!object(payload) || typeof payload.query !== 'string' || typeof payload.generated !== 'string') throw new Error('not a pi-literature-review lit-search JSON sidecar');
  if (!Array.isArray(payload.sources_used) || !Array.isArray(payload.results) || !Array.isArray(payload.dropped)) throw new Error('lit-search JSON has an unknown structure');
  const records = [...payload.results];
  for (const item of payload.dropped) {
    if (!object(item) || !object(item.record)) throw new Error('lit-search dropped record has an unknown structure');
    records.push(item.record);
  }
  if (!records.every(object)) throw new Error('lit-search record is not an object');
  return records;
}
/** 校验选中记录的书目字段、标识符及来源结构；verified 的真假由选择阶段另外检查。 */
export function validateSelected(record: RecordData): void {
  if (typeof record.title !== 'string' || !record.title.trim()) throw new Error('lit-search record has no title');
  if (!Array.isArray(record.authors) || !record.authors.length || !record.authors.every(a => typeof a === 'string' && a.trim())) throw new Error('lit-search record has invalid authors');
  if (!(typeof record.year === 'string' || typeof record.year === 'number') || !/^\d+$/.test(String(record.year))) throw new Error('lit-search record has invalid year');
  if (record.venue != null && typeof record.venue !== 'string') throw new Error('lit-search record has invalid venue');
  if (typeof record.doi !== 'string' || typeof record.arxiv_id !== 'string') throw new Error('lit-search record has invalid identifiers');
  if (!record.doi.trim() && !record.arxiv_id.trim()) throw new Error('lit-search record has no DOI or arXiv ID');
  if (typeof record.verified !== 'boolean') throw new Error('lit-search record has no verification status');
  const sources = record.sources ?? [record.source];
  if (!Array.isArray(sources) || !sources.length || !sources.every(s => typeof s === 'string' && s)) throw new Error('lit-search record has invalid sources');
}
/** 从已有论文 frontmatter 提取 DOI/arXiv 身份，避免重复导入改写已有阅读笔记。 */
async function existingIds(wiki: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const name of await fs.readdir(path.join(wiki, 'papers'))) {
    if (!name.endsWith('.md')) continue;
    const content = await fs.readFile(path.join(wiki, 'papers', name), 'utf8');
    const front = content.split('---', 3)[1];
    if (!front) continue;
    for (const kind of ['doi','arxiv']) {
      const match = new RegExp(`^  ${kind}: ["']?([^"'\\n]+)`, 'm').exec(front);
      if (match && match[1].trim() !== 'null') ids.add(normalizeId(`${kind}:${match[1].trim()}`));
    }
  }
  return ids;
}
/** 导入明确选中的记录：先检查全部身份冲突与所有选择，再进行任何页面写入。
 * 使用 sidecar 元数据直接调用统一写入器，不联网补猜；保存绝对来源路径和记录来源。 */
export async function importLiterature(source: string, wiki: string, ids: string[]): Promise<string> {
  const payload = JSON.parse(await fs.readFile(source, 'utf8'));
  const records = validatePayload(payload);
  if (!(await fs.stat(path.join(wiki, 'papers')).catch(() => null))?.isDirectory()) throw new Error('wiki is not initialized; run research_wiki init first');
  const byId = new Map<string, RecordData>();
  for (const record of records) for (const key of ['doi','arxiv_id']) {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const identity = normalizeId(`${key === 'arxiv_id' ? 'arxiv' : 'doi'}:${value.trim().toLowerCase()}`);
    const prior = byId.get(identity);
    if (prior && (prior.title !== record.title || JSON.stringify(prior.authors) !== JSON.stringify(record.authors) || String(prior.year) !== String(record.year))) throw new Error(`conflicting records for identifier: ${identity}`);
    if (!prior) byId.set(identity, record);
  }
  const selected: RecordData[] = [];
  for (const supplied of ids) {
    const record = byId.get(normalizeId(supplied));
    if (!record) throw new Error(`selected identifier absent from sidecar: ${supplied}`);
    validateSelected(record);
    if (!record.verified) throw new Error(`selected identifier is unverified: ${supplied}`);
    if (!selected.includes(record)) selected.push(record);
  }
  const seen = await existingIds(wiki), output: string[] = [];
  for (const record of selected) {
    const keys = new Set<string>();
    if (String(record.doi).trim()) keys.add(normalizeId(`doi:${record.doi}`));
    if (String(record.arxiv_id).trim()) keys.add(normalizeId(`arxiv:${record.arxiv_id}`));
    if ([...keys].some(k => seen.has(k))) { output.push(`Skipped existing ${recordId(record)}`); continue; }
    const meta: PaperMeta = { title: record.title as string, authors: record.authors as string[], year: Number(record.year), venue: (record.venue as string) || 'unknown', doi: record.doi as string, arxiv_id: record.arxiv_id as string };
    const provenance = { source_json: path.resolve(source), record_id: recordId(record), record_sources: (record.sources ?? [record.source]) as string[] };
    output.push(await ingestPaper(wiki, { arxivId: meta.arxiv_id, title: meta.title, authors: meta.authors, year: meta.year, venue: meta.venue, doi: meta.doi, prefetchedMeta: meta, provenance }));
    for (const key of keys) seen.add(key);
  }
  return output.join('\n') || 'No records imported';
}
/** 注册原生导入工具；相对 source/wikiRoot 基于研究项目 cwd 解析，异常转换为工具错误。 */
export default function register(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'literature_import', label: 'Literature Import',
    description: 'Import only explicitly selected verified DOI/arXiv records from a pi-literature-review JSON sidecar into the project research wiki.',
    parameters: Type.Object({ source: Type.String(), wikiRoot: Type.Optional(Type.String()), ids: Type.Array(Type.String(), { minItems: 1 }) }, { additionalProperties: false }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const source = path.resolve(ctx.cwd, params.source), wiki = path.resolve(ctx.cwd, params.wikiRoot ?? 'research-wiki');
        const output = await importLiterature(source, wiki, params.ids);
        return { content: [{ type: 'text' as const, text: output }], details: { source, wiki } };
      } catch (error) { return { content: [{ type: 'text' as const, text: `ERROR: ${error instanceof Error ? error.message : String(error)}` }], details: undefined, isError: true }; }
    },
  });
}
