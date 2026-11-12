/** ARIS 原生工具模块；下方中文注释说明接口约定与关键边界。 */
/**
 * Pure validation and assessment helpers for the Pi Reviewer Gate.
 *
 * This module has no dependency on Pi APIs or filesystem access.
 */

/** 审稿结论的规范值；解析时统一大小写与空白。 */
export type ReviewVerdict = "ready" | "almost" | "not ready";

/** 从回复中提取的唯一评分和结论。 */
export interface ReviewAssessment {
  score: number;
  verdict: ReviewVerdict;
}

/** 门禁所需的会话最小结构；每轮的具体字段在后续阶段验证。 */
export interface ReviewerSession {
  schemaVersion: 1;
  threadId: string;
  rounds: unknown[];
}

/** 表示会话格式或评分文本不可用于门禁判断的可报告错误。 */
export class ReviewDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewDataError";
  }
}

/** 将未知 JSON 值缩窄为普通对象形状，排除 null 和数组。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 把未知异常转换为可显示文本。 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parse and validate the ReviewerSession json file
 */
/** 解析版本 1 会话，并核对文件名与 threadId；拒绝空轮次或无效末轮结构。 */
export function parseReviewerSessionJson(
  jsonText: string,
  expectedThreadId: string,
): ReviewerSession {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch (error) {
    throw new ReviewDataError(
      `review session unreadable: ${getErrorMessage(error)}`,
    );
  }

  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    throw new ReviewDataError("unknown Pi reviewer record format");
  }

  const threadId = parsed.threadId;
  if (typeof threadId !== "string" || threadId !== expectedThreadId) {
    throw new ReviewDataError(
      "review threadId does not match session filename",
    );
  }

  const rounds = parsed.rounds;
  if (
    !Array.isArray(rounds) ||
    rounds.length === 0 ||
    !isRecord(rounds[rounds.length - 1])
  ) {
    throw new ReviewDataError("review session has no completed round");
  }

  return {
    schemaVersion: 1,
    threadId,
    rounds,
  };
}

/**
 * Extract exactly one Score and one Verdict from the reviewer response.
 *
 * Accepted formats:
 *   Score: 8.5/10
 *   - Score: 8.5 / 10
 *   Verdict: ready
 *   Verdict: not ready
 */
/** 要求回复恰好包含一条完整 Score 行和一条 Verdict 行；重复、缺失或越界均拒绝。 */
export function parseAssessment(response: string): ReviewAssessment {
  const scorePattern =
    /^\s*(?:[-*]\s*)?Score:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*10\s*$/gim;

  const verdictPattern =
    /^\s*(?:[-*]\s*)?Verdict:\s*(ready|almost|not\s+ready)\s*$/gim;

  const scores = Array.from(
    response.matchAll(scorePattern),
    (match) => match[1] ?? "",
  );

  const verdicts = Array.from(
    response.matchAll(verdictPattern),
    (match) => match[1] ?? "",
  );

  if (scores.length !== 1 || verdicts.length !== 1) {
    throw new ReviewDataError(
      "review must contain exactly one Score and Verdict",
    );
  }

  const score = Number(scores[0]);

  if (!Number.isFinite(score) || score < 1 || score > 10) {
    throw new ReviewDataError("score must be within 1..10");
  }

  const verdict = verdicts[0]
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim() as ReviewVerdict;

  return { score, verdict };
}

/** 导出统一的错误文本转换入口，供门禁适配层使用。 */
function getErrorMessageForExport(error: unknown): string {
  return getErrorMessage(error);
}

export { getErrorMessageForExport };
