/** ARIS 原生工具模块；下方中文注释说明接口约定与关键边界。 */
/**
 * Filesystem adapter for reading a Reviewer Session.
 *
 * This module only reads text from disk. JSON parsing and data validation
 * are intentionally delegated to evaluator.ts.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, parse, resolve } from "node:path";

/** 读取成功结果，同时提供绝对路径和由文件名推导的预期线程 ID。 */
export interface ReadReviewerSessionSuccess {
    ok: true;
    absolutePath: string;
    expectedThreadId: string;
    content: string;
}

/** 读取失败结果；保留路径与原因供门禁报告。 */
export interface ReadReviewerSessionFailure {
    ok: false;
    absolutePath: string;
    reason: string;
}

/** 以 ok 字段区分成功和失败，避免调用方使用缺失的会话内容。 */
export type ReadReviewerSessionResult =
    | ReadReviewerSessionSuccess
    | ReadReviewerSessionFailure;

/** 兼容 Error 实例与其他抛出值。 */
function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Read a Reviewer Session file.
 *
 * Relative paths are resolved against cwd. Absolute paths are preserved.
 * The expected thread ID is derived from the filename without its final
 * extension, matching pathlib.Path.stem in the Python implementation.
 */
/** 按项目 cwd 解析相对路径并读取 UTF-8 内容；这里只处理文件访问，结构校验交给 evaluator。 */
export async function readReviewerSession(
    sessionPath: string,
    cwd: string,
): Promise<ReadReviewerSessionResult> {
    const absolutePath = isAbsolute(sessionPath)
        ? resolve(sessionPath)
        : resolve(cwd, sessionPath);

    try {
        const content = await readFile(absolutePath, "utf8");

        return {
            ok: true,
            absolutePath,
            expectedThreadId: parse(absolutePath).name,
            content,
        };
    } catch (error) {
        return {
            ok: false,
            absolutePath,
            reason: `review session unreadable: ${getErrorMessage(error)}`,
        };
    }
}
