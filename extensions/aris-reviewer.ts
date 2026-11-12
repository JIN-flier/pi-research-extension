import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { Value } from "typebox/value";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { configureArisRepo, runReviewSession } from "./aris-reviewer-core.ts";

const ReviewerConfig = Type.Object({
  provider: Type.String({ pattern: "^[^\\s/]+$" }),
  id: Type.String({ pattern: "^\\S+$" }),
});

function toolError(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: undefined,
    isError: true,
  };
}

export default function (pi: ExtensionAPI) {
  // ARIS_REPO locates package tools; reviewer paths always use ctx.cwd.
  configureArisRepo(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  );

  const reviewerPicker = {
    description:
      "选择 reviewer 模型（建议使用能力较强且与执行模型不同的模型）",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const models = ctx.modelRegistry.getAvailable();
      if (!models.length) {
        ctx.ui.notify("没有可用的 reviewer 模型，请先配置模型及认证。", "error");
        return;
      }
      const q = args.trim().toLowerCase();
      const exact = models.filter(
        (m) => `${m.provider}/${m.id}`.toLowerCase() === q,
      );
      const matches = exact.length
        ? exact
        : models.filter(
            (m) =>
              `${m.provider}/${m.id}`.toLowerCase().includes(q) ||
              (m.name ?? "").toLowerCase().includes(q),
          );
      if (!matches.length) {
        ctx.ui.notify(`没匹配到模型：${args.trim()}`, "error");
        return;
      }
      let target = q && matches.length === 1 ? matches[0] : undefined;

      if (!target) {
        if (!ctx.hasUI) {
          ctx.ui.notify(
            q
              ? `匹配到多个模型，请用 /aris-reviewer-picker provider/model 指定：\n${matches.map((m) => `${m.provider}/${m.id}`).join("\n")}`
              : "无界面模式请提供模型，如 /aris-reviewer-picker provider/model。",
            "error",
          );
          return;
        }
        const labels = matches.map(
          (m) => `${m.provider}/${m.id} · ${m.name ?? m.id}`,
        );
        const picked = await ctx.ui.select("选择 ARIS reviewer 模型", labels);
        if (picked === undefined) return;
        target = matches[labels.indexOf(picked)];
        if (!target) return;
      }

      const model = ctx.modelRegistry.find(target.provider, target.id);
      const reference = `${target.provider}/${target.id}`;
      if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) {
        ctx.ui.notify(
          `Model unavailable or authentication missing: ${reference}`,
          "error",
        );
        return;
      }
      const directory = path.join(ctx.cwd, ".aris");
      try {
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(
          path.join(directory, "reviewer.json"),
          JSON.stringify({ provider: model.provider, id: model.id }, null, 2) +
            "\n",
        );
      } catch (error) {
        ctx.ui.notify(`无法保存 ARIS reviewer 配置：${String(error)}`, "error");
        return;
      }
      ctx.ui.notify(`ARIS reviewer: ${reference}`, "info");
    },
  };
  pi.registerCommand("aris-reviewer-picker", reviewerPicker);

  pi.registerTool({
    name: "aris_review",
    label: "ARIS Review",
    description:
      "Run or continue an ARIS external review using the model configured in .aris/reviewer.json. Returns reviewer text and threadId.",
    parameters: Type.Object({
      prompt: Type.String(),
      threadId: Type.Optional(Type.String()),
      files: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const project = ctx.cwd;
      const configPath = path.join(project, ".aris", "reviewer.json");
      const configureHint = "Run /aris-reviewer-picker provider/model.";
      let config: unknown;
      try {
        config = JSON.parse(await fs.readFile(configPath, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return toolError(`ARIS reviewer unset. ${configureHint}`);
        }
        return toolError(
          `Cannot read ARIS reviewer config: ${String(error)}. ${configureHint}`,
        );
      }
      if (!Value.Check(ReviewerConfig, config)) {
        return toolError(
          `ARIS reviewer config must contain non-empty provider and id strings without whitespace; provider must not contain '/'. ${configureHint}`,
        );
      }
      const selected = `${config.provider}/${config.id}`;
      const model = ctx.modelRegistry.find(config.provider, config.id);
      if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) {
        return toolError(
          `Model ${selected} unavailable or authentication missing. ${configureHint}`,
        );
      }
      try {
        const review = await runReviewSession({
          project,
          prompt: params.prompt,
          files: params.files ?? [],
          threadId: params.threadId,
          requestedModel: selected,
          complete: (reviewPrompt: string) =>
            ctx.modelRegistry.complete(
              model,
              {
                messages: [
                  {
                    role: "user",
                    content: [{ type: "text", text: reviewPrompt }],
                    timestamp: Date.now(),
                  },
                ],
              },
              { signal, cacheRetention: "none" },
            ),
        });
        if (review.status !== "ok") {
          return {
            content: [
              {
                type: "text",
                text: `${review.error}\nthreadId: ${review.threadId}`,
              },
            ],
            details: review,
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `${review.answer}\n\nReviewer-Model: ${review.reportedModel ?? "unknown"}\nthreadId: ${review.threadId}`,
            },
          ],
          details: review,
        };
      } catch (error) {
        return toolError(String(error));
      }
    },
  });
}
