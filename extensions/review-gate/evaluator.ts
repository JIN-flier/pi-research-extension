/**
 * Pure validation and assessment helpers for the Pi Reviewer Gate.
 *
 * This module has no dependency on Pi APIs or filesystem access.
 */

export type ReviewVerdict = "ready" | "almost" | "not ready";

export interface ReviewAssessment {
  score: number;
  verdict: ReviewVerdict;
}

export interface ReviewerSession {
  schemaVersion: 1;
  threadId: string;
  rounds: unknown[];
}

export class ReviewDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewDataError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parse and validate the ReviewerSession json file
 */
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

function getErrorMessageForExport(error: unknown): string {
  return getErrorMessage(error);
}

export { getErrorMessageForExport };
