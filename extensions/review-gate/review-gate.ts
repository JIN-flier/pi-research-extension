/** ARIS 原生工具模块；下方中文注释说明接口约定与关键边界。 */
/**
 * Pi Agent Extension: Reviewer Gate.
 *
 * Registers the review_gate tool and coordinates:
 *   1. Reading the Reviewer Session.
 *   2. Validating the session and review response.
 *   3. Confirming the reviewed scope.
 *   4. Producing stop, continue, or review_unavailable without model checks.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { Type } from "typebox";

import { readReviewerSession } from "./session-reader.ts";
import { createScopeConfirmationView } from "./scope-confirmation.ts";
import {
  getErrorMessageForExport,
  isRecord,
  parseAssessment,
  parseReviewerSessionJson,
  type ReviewVerdict,
  type ReviewerSession,
} from "./evaluator.ts";

/** 门禁动作：通过后停止、未达标继续、证据或确认不可用。 */
export type ReviewDecision = "stop" | "continue" | "review_unavailable";

/** 门禁的结构化输出，包含决策、验收状态及可用的审稿证据。 */
export interface ReviewResult {
  decision: ReviewDecision;
  next_backend: "pi" | null;
  acceptance_status: "accepted" | "provisional";
  reason: string;
  thread_id: string | null;
  reviewer_model: string | null;
  score: number | null;
  verdict: ReviewVerdict | null;
}

/** 独立门禁判断所需的会话路径、项目目录和已确认范围状态。 */
export interface EvaluateReviewGateInput {
  sessionPath: string;
  cwd: string;
  scopeComplete: boolean;
}

/** 统一生成不可验收结果，避免读取或校验失败被误报为通过。 */
function unavailable(
  reason: string,
  threadId: string | null = null,
  reviewerModel: string | null = null,
): ReviewResult {
  return {
    decision: "review_unavailable",
    next_backend: null,
    acceptance_status: "provisional",
    reason,
    thread_id: threadId,
    reviewer_model: reviewerModel,
    score: null,
    verdict: null,
  };
}

/**
 * Core decision logic. This function does not depend on Pi APIs and can be
 * tested independently.
 */
/** 读取并校验会话后判断最新轮次；此核心入口不依赖 Pi UI。 */
export async function evaluateReviewGate(
  input: EvaluateReviewGateInput,
): Promise<ReviewResult> {
  const readResult = await readReviewerSession(input.sessionPath, input.cwd);

  if (!readResult.ok) {
    return unavailable(readResult.reason);
  }

  let session: ReviewerSession;

  try {
    session = parseReviewerSessionJson(
      readResult.content,
      readResult.expectedThreadId,
    );
  } catch (error) {
    return unavailable(getErrorMessageForExport(error));
  }

  return evaluateSavedReview(session, input.scopeComplete);
}

/** 仅检查最新轮次：完整完成、范围已确认、评分格式有效后才应用验收阈值。 */
function evaluateSavedReview(
  session: ReviewerSession,
  scopeComplete: boolean,
): ReviewResult {
  const roundRecord = session.rounds[session.rounds.length - 1] as Record<
    string,
    unknown
  >;

  const reportedModel = roundRecord.reportedModel;
  const reviewerModel =
    typeof reportedModel === "string" ? reportedModel : null;

  if (
    roundRecord.status !== "ok" ||
    roundRecord.stopReason !== "stop" ||
    (roundRecord.error !== null && roundRecord.error !== undefined)
  ) {
    return unavailable(
      "latest Pi review round did not complete successfully",
      session.threadId,
      reviewerModel,
    );
  }

  if (!scopeComplete) {
    return unavailable(
      "review scope was not confirmed complete",
      session.threadId,
      reviewerModel,
    );
  }

  const response = roundRecord.result;
  if (typeof response !== "string") {
    return unavailable(
      "review result is missing",
      session.threadId,
      reviewerModel,
    );
  }

  // Parse the score and verdict from the saved reviewer response.
  let assessment: ReturnType<typeof parseAssessment>;
  try {
    assessment = parseAssessment(response);
  } catch (error) {
    return unavailable(
      getErrorMessageForExport(error),
      session.threadId,
      reviewerModel,
    );
  }
  // A score of at least 6 and "ready" or "almost" meets the threshold.
  const positive =
    assessment.score >= 6 &&
    (assessment.verdict === "ready" || assessment.verdict === "almost");

  return {
    decision: positive ? "stop" : "continue",
    next_backend: positive ? null : "pi",
    acceptance_status: positive ? "accepted" : "provisional",
    reason: positive
      ? "Pi reviewer met the acceptance threshold"
      : "Pi reviewer did not meet the acceptance threshold",
    thread_id: session.threadId,
    reviewer_model: reviewerModel,
    score: assessment.score,
    verdict: assessment.verdict,
  };
}

// Show saved text as data, with terminal controls and invisible formatting
// characters escaped so a filename or response cannot erase the dialog.
/** 转义终端控制及不可见格式字符，防止保存的外部文本改变确认界面的显示。 */
function displayText(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}]/gu, (ch) =>
    ch === "\n"
      ? "\n"
      : `\\u${ch.codePointAt(0)!.toString(16).padStart(4, "0")}`,
  );
}

/** 构造供用户核对的请求、回复及文件快照清单；先验证快照哈希再允许确认。 */
function scopeConfirmation(
  session: ReviewerSession,
  sessionPath: string,
): string {
  const round = session.rounds[session.rounds.length - 1] as Record<
    string,
    unknown
  >;
  if (
    typeof round.prompt !== "string" ||
    !round.prompt.trim() ||
    !Array.isArray(round.inputFiles)
  ) {
    throw new Error(
      "latest review lacks the saved request or file snapshot list needed to confirm scope",
    );
  }
  const files = round.inputFiles.map((file) => {
    if (
      !isRecord(file) ||
      typeof file.path !== "string" ||
      !file.path.trim() ||
      typeof file.sha256 !== "string" ||
      typeof file.content !== "string" ||
      file.sha256 !== createHash("sha256").update(file.content).digest("hex")
    ) {
      throw new Error(
        "latest review has invalid file snapshot evidence; scope cannot be confirmed",
      );
    }
    return `- ${displayText(JSON.stringify(file.path))}\n  SHA-256: ${file.sha256}`;
  });
  return [
    `Session: ${displayText(sessionPath)}`,
    `Thread: ${displayText(session.threadId)}`,
    `Round: ${session.rounds.length}`,
    `Reviewer (recorded, not checked): ${displayText(typeof round.reportedModel === "string" ? round.reportedModel : "not recorded")}`,
    `Completed: ${displayText(typeof round.completedAt === "string" ? round.completedAt : "not recorded")}`,
    "",
    "Saved request / task scope (recorded text):",
    displayText(round.prompt),
    "",
    "Files supplied in this round (reviewed snapshot versions):",
    ...(files.length
      ? files
      : ["No file snapshots supplied (prompt-only review)."]),
    "These SHA-256 values identify saved snapshots, not the current working tree or a Git revision.",
    "",
    "Saved reviewer response / scope limits (recorded text):",
    displayText(String(round.result)),
    "",
    "Confirm only if this request, these snapshot versions and the reviewer's stated coverage match the entire intended scope. Decline if anything is missing, changed or uncertain.",
  ].join("\n");
}

/** 将结构化门禁结果同时作为可读 JSON 与 details 返回。 */
function toolResult(result: ReviewResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    details: result,
  };
}

/**
 * Register the native Pi tool.
 *
 * reviewScopeComplete=true only requests a human confirmation. The boolean
 * supplied by the LLM is never trusted on its own. In non-interactive modes,
 * scopeComplete remains false and the gate fails closed.
 */
/** 注册门禁工具；LLM 的 reviewScopeComplete 只触发人工确认，不能自行证明范围完整。 */
export default function registerReviewGate(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "review_gate",
    label: "Review Gate",
    description:
      "Evaluate the latest saved Pi Reviewer Session. Checks session " +
      "format, round completion, scope confirmation, and the reviewer's " +
      "Score/Verdict. Does not check reviewer or executor models. Returns stop, continue, or " +
      "review_unavailable. Set reviewScopeComplete=true only when you " +
      "have reason to request a human confirmation that the full review " +
      "scope was completed.",
    parameters: Type.Object(
      {
        sessionPath: Type.String({
          minLength: 1,
          description:
            "Reviewer Session JSON path. Relative paths are resolved from the current Pi working directory. Example: .aris/reviewer-sessions/<threadId>.json",
        }),
        reviewScopeComplete: Type.Optional(
          Type.Boolean({
            description:
              "Request an interactive human confirmation that the full intended review scope was completed. This flag alone is not trusted.",
          }),
        ),
      },
      { additionalProperties: false },
    ),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      // read reviewer session json file `<ThreadID>.json`
      const readResult = await readReviewerSession(params.sessionPath, ctx.cwd);
      if (!readResult.ok) return toolResult(unavailable(readResult.reason));
      // guarantees that the latest round is an object.
      let session: ReviewerSession;
      try {
        session = parseReviewerSessionJson(
          readResult.content,
          readResult.expectedThreadId,
        );
      } catch (error) {
        return toolResult(unavailable(getErrorMessageForExport(error)));
      }
      // Validate the round before asking the user to approve it. Both the
      // displayed evidence and final evaluation use this same parsed record.
      const preflight = evaluateSavedReview(session, true);
      if (preflight.decision === "review_unavailable")
        return toolResult(preflight);
      let scopeComplete = false;

      if (
        params.reviewScopeComplete === true &&
        ctx.hasUI &&
        !signal?.aborted
      ) {
        let message: string;
        try {
          message = scopeConfirmation(session, readResult.absolutePath);
        } catch (error) {
          return toolResult(
            unavailable(
              getErrorMessageForExport(error),
              session.threadId,
              preflight.reviewer_model,
            ),
          );
        }
        try {
          const customResult =
            typeof ctx.ui.custom === "function"
              ? await ctx.ui.custom<boolean | undefined>(
                  (tui, _theme, _keys, done) =>
                    createScopeConfirmationView(
                      message,
                      () => tui.terminal.rows,
                      () => tui.requestRender(),
                      done,
                      signal,
                    ),
                  {
                    blocked: {
                      kind: "permission",
                      message: "Confirm Reviewer Scope",
                    },
                  },
                )
              : undefined;
          // Pi RPC exposes custom() as a no-op returning undefined, while
          // confirm() is forwarded to the client. A real rejection is false
          // and must never open a second confirmation dialog.
          scopeComplete =
            customResult === undefined && !signal?.aborted
              ? (await ctx.ui.confirm("Confirm Reviewer Scope", message, {
                  signal,
                })) === true
              : customResult === true;
        } catch {
          // Any unavailable/failed confirmation must fail closed.
          scopeComplete = false;
        }
      }

      if (scopeComplete) {
        const latest = await readReviewerSession(params.sessionPath, ctx.cwd);
        if (!latest.ok || latest.content !== readResult.content) {
          return toolResult(
            unavailable(
              "review session changed during scope confirmation; run review_gate again",
              session.threadId,
              preflight.reviewer_model,
            ),
          );
        }
      }
      return toolResult(
        evaluateSavedReview(
          session,
          scopeComplete && !signal?.aborted,
        ),
      );
    },
  });
}
