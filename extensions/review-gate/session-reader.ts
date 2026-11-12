/**
 * Filesystem adapter for reading a Reviewer Session.
 *
 * This module only reads text from disk. JSON parsing and data validation
 * are intentionally delegated to evaluator.ts.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, parse, resolve } from "node:path";

export interface ReadReviewerSessionSuccess {
    ok: true;
    absolutePath: string;
    expectedThreadId: string;
    content: string;
}

export interface ReadReviewerSessionFailure {
    ok: false;
    absolutePath: string;
    reason: string;
}

export type ReadReviewerSessionResult =
    | ReadReviewerSessionSuccess
    | ReadReviewerSessionFailure;

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
