/** ARIS 原生工具模块；下方中文注释说明接口约定与关键边界。 */
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

/** 续审历史中的一条消息；只有成功轮次会追加到此历史。 */
export type ReviewHistoryTurn = {
  role: "user" | "assistant";
  text: string;
};

/** 单次审稿尝试的审计记录，包含输入快照、请求/实际模型、完成状态及失败信息。 */
export type ReviewRound = {
  number: number;
  startedAt: string;
  completedAt: string | null;
  requestedModel: string;
  reportedModel: string | null;
  stopReason: string | null;
  status: "pending" | "ok" | "error" | "aborted";
  prompt: string;
  inputFiles: Array<{ path: string; sha256: string; content: string }>;
  result: string | null;
  error: string | null;
};

/** 版本化会话文件：将可复用对话历史与全部尝试记录分别保存。 */
export type ReviewSessionRecord = {
  schemaVersion: 1;
  threadId: string;
  model: string;
  history: ReviewHistoryTurn[];
  rounds: ReviewRound[];
};

/** 模型适配层返回的数据；实际模型身份与停止原因用于判断是否完整完成。 */
export type ReviewResponse = {
  provider?: string;
  model?: string;
  stopReason?: string;
  content?: Array<{ type: string; text?: string }>;
};

/** 会话执行依赖：项目目录、请求、输入文件及模型完成回调。 */
export type ReviewSessionOptions = {
  project: string;
  prompt: string;
  files?: string[];
  threadId?: string;
  requestedModel: string;
  complete: (prompt: string) => Promise<ReviewResponse>;
};

/** 调用结果的判别联合：成功提供 answer，失败或取消提供 error。 */
export type ReviewSessionResult = {
  threadId: string;
  requestedModel: string;
  reportedModel: string | null;
  stopReason: string | null;
} & (
  | { status: "ok"; answer: string }
  | { status: "error" | "aborted"; error: string }
);

/** 只在第一个斜杠处分开 provider 与模型 ID，允许模型 ID 自身包含斜杠。 */
export function parseModelRef(reference: string): {
  provider: string;
  id: string;
} {
  const slash = reference.indexOf("/");
  if (slash < 1 || slash === reference.length - 1) {
    throw new Error("Reviewer model must be provider/model");
  }
  return {
    provider: reference.slice(0, slash),
    id: reference.slice(slash + 1),
  };
}

/** 限制输入文件的解析路径位于项目内；调用方还需对 realpath 再检查以阻止符号链接逃逸。 */
export function safeInputPath(project: string, candidate: string): string {
  const absolute = path.resolve(project, candidate);
  const relative = path.relative(path.resolve(project), absolute);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Reviewer input is outside the project");
  }
  return absolute;
}

/** 返回追加用户请求与成功回复的新历史，避免原地修改旧数组。 */
export function nextHistory(
  history: ReviewHistoryTurn[],
  prompt: string,
  response: string,
): ReviewHistoryTurn[] {
  return [
    ...history,
    { role: "user", text: prompt },
    { role: "assistant", text: response },
  ];
}

/** 先写同目录临时文件再 rename，避免读者看到半写入 JSON；失败时清理临时文件。 */
async function saveSession(
  filename: string,
  session: ReviewSessionRecord,
): Promise<void> {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(
      temporary,
      JSON.stringify(session, null, 2) + "\n",
      "utf8",
    );
    await fs.rename(temporary, filename);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

/** Persist one Pi reviewer attempt and return its result. A failed attempt is
 * visible in rounds but does not enter the conversation history used on retry. */
/** 执行一个可续接审稿轮次：保存 pending 记录、调用模型、验证完成信息，再持久化最终状态。
 * 失败尝试保留审计痕迹，但不进入后续模型使用的对话历史。 */
export async function runReviewSession({
  project,
  prompt,
  files = [],
  threadId,
  requestedModel,
  complete,
}: ReviewSessionOptions): Promise<ReviewSessionResult> {
  const pair = parseModelRef(requestedModel);
  const id = threadId ?? randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new Error("Invalid ARIS review threadId.");
  const filename = path.join(
    project,
    ".aris",
    "reviewer-sessions",
    `${id}.json`,
  );
  let session: ReviewSessionRecord;
  if (threadId) {
    try {
      session = JSON.parse(await fs.readFile(filename, "utf8"));
    } catch {
      throw new Error("ARIS review thread not found.");
    }
    if (session.model !== requestedModel)
      throw new Error("Reviewer model changed; start a new review thread.");
    if (!Array.isArray(session.history))
      throw new Error("ARIS review thread has invalid history.");
  } else {
    session = {
      schemaVersion: 1,
      threadId: id,
      model: requestedModel,
      history: [],
      rounds: [],
    };
  }
  session.schemaVersion = 1;
  session.threadId = id;
  session.rounds ??= [];
  if (!Array.isArray(session.rounds))
    throw new Error("ARIS review thread has invalid rounds.");
  if (threadId && session.history.length && !session.rounds.length) {
    throw new Error(
      "Legacy review thread lacks actual model identity; start a new review thread.",
    );
  }

  const round: ReviewRound = {
    number: session.rounds.length + 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
    requestedModel,
    reportedModel: null,
    stopReason: null,
    status: "pending",
    prompt,
    inputFiles: [],
    result: null,
    error: null,
  };
  session.rounds.push(round);
  try {
    const inputs: string[] = [];
    for (const candidate of files) {
      const absolute = safeInputPath(project, candidate);
      const real = await fs.realpath(absolute);
      safeInputPath(project, real);
      const content = await fs.readFile(real, "utf8");
      round.inputFiles.push({
        path: candidate,
        sha256: createHash("sha256").update(content).digest("hex"),
        content,
      });
      inputs.push(
        `\n<file path=${JSON.stringify(candidate)}>\n${content}\n</file>`,
      );
    }
    const reviewPrompt = [
      "You are an independent ARIS research reviewer. Assess the supplied evidence and state uncertainty precisely.",
      "Prior review conversation:",
      ...session.history.map((turn) => `${turn.role}: ${turn.text}`),
      "Current review request:",
      prompt,
      ...inputs,
    ].join("\n\n");
    await saveSession(filename, session);
    const response = await complete(reviewPrompt);
    round.stopReason = response?.stopReason ?? null;
    round.reportedModel = response?.model
      ? `${response.provider ?? pair.provider}/${response.model}`
      : null;
    const answer = (response?.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    round.result = answer || null;
    if (response?.stopReason !== "stop") {
      throw new Error(
        `ARIS reviewer did not complete: ${response?.stopReason ?? "unknown"}`,
      );
    }
    if (!answer.trim()) throw new Error("ARIS reviewer returned no text.");
    if (!round.reportedModel)
      throw new Error("ARIS reviewer did not report actual model identity.");
    const previous = session.rounds
      .slice(0, -1)
      .reverse()
      .find((item) => item.status === "ok");
    if (previous && previous.reportedModel !== round.reportedModel) {
      throw new Error(
        `ARIS actual reviewer model changed from ${previous.reportedModel} to ${round.reportedModel}; start a new review thread.`,
      );
    }
    round.status = "ok";
    session.history = nextHistory(
      session.history,
      prompt + inputs.join(""),
      answer,
    );
    round.completedAt = new Date().toISOString();
    await saveSession(filename, session);
    return {
      status: "ok",
      threadId: id,
      requestedModel,
      reportedModel: round.reportedModel,
      stopReason: round.stopReason,
      answer,
    };
  } catch (error) {
    round.status = round.stopReason === "aborted" ? "aborted" : "error";
    round.error = error instanceof Error ? error.message : String(error);
    round.completedAt = new Date().toISOString();
    await saveSession(filename, session);
    return {
      status: round.status,
      threadId: id,
      requestedModel,
      reportedModel: round.reportedModel,
      stopReason: round.stopReason,
      error: round.error,
    };
  }
}
