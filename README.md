# ARIS for Pi

ARIS 是一个 Pi package，提供 **10 个研究决策 skills**，以及 `aris_review`、`threat_scan`、`review_gate`、`research_wiki`、`literature_import` 和 `capture_filter` 原生工具。论文搜索、选文下载与 PDF 综合由 `pi-literature-review` 负责；普通网页搜索与读取由 `pi-web-access` 负责。ARIS 保留 idea、查新、知识库、方案、实验和审稿流程。

## 安装

在研究项目目录中安装三个 Pi packages：

```bash
pi install npm:pi-literature-review --local
pi install npm:pi-web-access --local
pi install /absolute/path/to/ARIS --local
```

将 `/absolute/path/to/ARIS` 替换为本仓库的绝对路径。若使用已发布的 ARIS Git 仓库，也可用 Pi 的 `git:github.com/OWNER/REPO` 包源替换本地路径。进入项目运行 `pi`，用 `/login` 配置模型，再用 `/aris-reviewer-picker` 打开 reviewer 模型选择器，或用 `/aris-reviewer-picker provider/model` 直接指定。也支持按名称或模型 ID 搜索；多个匹配时由你选择，无界面模式需提供能唯一确定模型的参数。

Pi 从 `package.json` 加载 `extensions/` 下的原生工具和 `skills/aris/`。研究 wiki、文献导入和 capture filter 已由 TypeScript pi agent tool 实现；包内 Python 脚本保留供旧版 CLI 使用。`.aris/` 中的审稿设置和会话、`lit-search/` 与 `research-wiki/` 都保存在**研究项目**中。开发本包时，修改后可在 Pi 中运行 `/reload`。

`ARIS_REPO` 仅供旧版 CLI 定位包内 Python 工具；原生工具和 reviewer 配置始终使用当前项目，reviewer 会话写入该项目的 `.aris/reviewer-sessions/`。

reviewer 配置 `.aris/reviewer.json` 只保存 `provider` 和 `id`，例如：

```json
{ "provider": "your-provider", "id": "your-model-id" }
```

`aris_review` 只从此配置读取模型，不接受 `model` 覆盖参数。旧的 `{ "backend": "pi", "model": "provider/model" }` 配置需重新运行选择命令生成新格式；已有审稿会话仍可在选择同一模型后用原 `threadId` 继续，切换模型则需新建审稿线程。

reviewer 与 executor 可以使用同一模型。首次调用 `aris_review` 不传 `threadId`，由工具创建独立审稿会话；后续修改复用返回的 `threadId`。每个审稿线程仅使用本次 prompt、文件快照及自己的历史，不会自动带入 executor 对话或其他审稿线程的上下文。

`threat_scan` 是原生 Pi tool，参数为 `content`（实际文本）、`scope`（`all`、`context`、`strict`）和 `action`（`scan`、`first_message`、`quarantine`）。`scan` 默认 `context`，另外两个动作默认 `strict`；持久化或复用外部文本时显式指定 `strict`。它不读取路径、不写文件，`quarantine` 命中时仅返回替代占位文本，原文由调用方另行保留。未命中只代表未发现已知模式。

`review_gate` 接收 `sessionPath` 和可选的 `reviewScopeComplete`。`reviewScopeComplete: true` 会请求用户通过 UI 确认完整审稿范围；无 UI、拒绝确认或无法确认时返回 `review_unavailable`。确认后仍需成功的最新审稿轮次、唯一的 `Score: X/10` 与 `Verdict: ready|almost|not ready`；分数 ≥6 且 verdict 为 `ready` 或 `almost` 才返回 `stop`。skills 使用对应的原生工具；保留的 Python 脚本用于内部依赖或旧 CLI 兼容，不用于绕过门禁确认。旧 CLI 的 `--executor-model` 参数仅为兼容而保留，传入值会被忽略。

范围确认会展示本轮保存的审稿请求、reviewer 回复及其范围限制、会话/轮次/完成时间，以及实际输入文件的路径和快照 SHA-256；没有文件输入时明确标注为仅审查 prompt。Pi TUI 中可用方向键、PageUp/PageDown 滚动，Enter 确认、Escape 拒绝。快照哈希表示当时送审的文本版本，不代表当前工作区或 Git 版本；文件、版本或审查范围不符时应拒绝。缺失或损坏的范围证据不会进入确认，确认期间会话记录变化则需要重新调用门禁。

## 最短研究流程

1. 在 Pi 中用 `/lit-search` 搜索论文。打开生成的 HTML，选出明确的 DOI/arXiv ID；JSON 同名 sidecar 保存完整检索记录。
2. 用 `/lit-selection` 下载所选开放全文；需要比较具体方法或结果时，用 `/lit-synthesis` 阅读并取得页码证据。下载失败的论文可保留为待查线索。
3. 用 `/skill:research-wiki` 导入**用户明确选定**且在 JSON 中 `verified: true` 的论文。`literature_import` 原生工具按 DOI/arXiv ID 去重，并记录源 JSON、记录 ID 和来源。HTML 勾选状态不会自动写入 JSON，需把选中的标识符交给导入工具或 skill。
4. 用 `/skill:idea-creator` 生成候选 idea，用 `/skill:novelty-check` 核对最近工作；两者读取插件 JSON 的真实记录。网页结果只能作为线索，不能直接标成已核验论文。
5. 用 `/skill:research-refine` 细化方法，再用 `/skill:experiment-plan` 设计验证。需要执行时依次用 `/skill:experiment-bridge`、`/skill:run-experiment`、`/skill:analyze-results`。
6. 用 `/skill:research-review` 做一次独立审稿，或用 `/skill:auto-review-loop` 迭代修改和续审。同一审稿线程传回 `threadId`；Pi 扩展在 `.aris/reviewer-sessions/<threadId>.json` 保存实际模型、输入快照、结果与错误。

这 10 个 skills 可按已有研究进度单独使用，不要求从第一步重新开始。若缺少文献插件，涉及新论文身份或查新的步骤应说明缺口；若缺少网页插件，普通网页补查不可用；若 reviewer 未配置或调用失败，报告 `REVIEW_UNAVAILABLE`，不把执行者自评当成独立审稿。

## 开发验证

使用 Node.js 22.19 或更高版本运行测试。审稿会话核心位于 `extensions/aris-reviewer/review-session-manager.ts`，门禁解析位于 `extensions/review-gate/evaluator.ts`，类型检查覆盖所有扩展实现。

```bash
npm test
npm run typecheck
python3 -m unittest discover -s tests -p 'test_*.py'
```

Node 测试检查 10 个 skill、包入口和本地文档引用，使用实际 Pi loader 验证原生工具的注册与调用，并覆盖 wiki 写入、文献导入、capture filter、扫描规则与 Python 版一致性、隔离输出、门禁决策及 UI 确认分支。Python 测试覆盖文献 JSON 导入与旧 CLI 门禁。模型完成响应和 UI 确认在测试中使用测试替身，不发起真实模型请求。`.aris/reviewer-sessions/` 含完整提示、输入文件内容和审稿结果，按项目私有研究数据管理。

## Acknowledgements

+ [AI Scientist](https://github.com/SakanaAI/AI-Scientist) (Sakana) 
+ [AutoResearch](https://github.com/karpathy/autoresearch) (Karpathy) 
+ [FARS](https://analemma.ai/blog/introducing-fars/) (Analemma) 
+ [PaperBanana](https://github.com/dwzhu-pku/PaperBanana) (PKU) 
+ [ARIS](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep.git) (SJTU).


## 16. License

MIT
