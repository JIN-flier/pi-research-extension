# ARIS for Pi

ARIS 是一个 Pi package，提供 **10 个研究决策 skills**、`aris_review` 审稿扩展和少量确定性工具。论文搜索、选文下载与 PDF 综合由 `pi-literature-review` 负责；普通网页搜索与读取由 `pi-web-access` 负责。ARIS 保留 idea、查新、知识库、方案、实验和审稿流程。

## 安装

在研究项目目录中安装三个 Pi packages：

```bash
pi install npm:pi-literature-review --local
pi install npm:pi-web-access --local
pi install /absolute/path/to/ARIS --local
```

将 `/absolute/path/to/ARIS` 替换为本仓库的绝对路径。若使用已发布的 ARIS Git 仓库，也可用 Pi 的 `git:github.com/OWNER/REPO` 包源替换本地路径。进入项目运行 `pi`，用 `/login` 配置模型，再用 `/aris-reviewer provider/model` 选择一个已认证的 reviewer 模型。需要审稿独立性时，选与执行模型不同的模型家族。

Pi 从 `package.json` 加载 `extensions/aris-reviewer.ts` 和 `skills/aris/`。包内 Python 工具从安装目录的 `tools/` 调用；`.aris/` 中的审稿设置和会话、`lit-search/` 与 `research-wiki/` 都保存在**研究项目**中。开发本包时，修改后可在 Pi 中运行 `/reload`。

## 最短研究流程

1. 在 Pi 中用 `/lit-search` 搜索论文。打开生成的 HTML，选出明确的 DOI/arXiv ID；JSON 同名 sidecar 保存完整检索记录。
2. 用 `/lit-selection` 下载所选开放全文；需要比较具体方法或结果时，用 `/lit-synthesis` 阅读并取得页码证据。下载失败的论文可保留为待查线索。
3. 用 `/skill:research-wiki` 导入**用户明确选定**且在 JSON 中 `verified: true` 的论文。`tools/literature_import.py` 按 DOI/arXiv ID 去重，并记录源 JSON、记录 ID 和来源。HTML 勾选状态不会自动写入 JSON，需把选中的标识符交给导入命令或 skill。
4. 用 `/skill:idea-creator` 生成候选 idea，用 `/skill:novelty-check` 核对最近工作；两者读取插件 JSON 的真实记录。网页结果只能作为线索，不能直接标成已核验论文。
5. 用 `/skill:research-refine` 细化方法，再用 `/skill:experiment-plan` 设计验证。需要执行时依次用 `/skill:experiment-bridge`、`/skill:run-experiment`、`/skill:analyze-results`。
6. 用 `/skill:research-review` 做一次独立审稿，或用 `/skill:auto-review-loop` 迭代修改和续审。同一审稿线程传回 `threadId`；Pi 扩展在 `.aris/reviewer-sessions/<threadId>.json` 保存实际模型、输入快照、结果与错误。

这 10 个 skills 可按已有研究进度单独使用，不要求从第一步重新开始。若缺少文献插件，涉及新论文身份或查新的步骤应说明缺口；若缺少网页插件，普通网页补查不可用；若 reviewer 未配置或调用失败，报告 `REVIEW_UNAVAILABLE`，不把执行者自评当成独立审稿。

## 开发验证

```bash
npm test
npm run typecheck
python3 -m unittest discover -s tests -p 'test_*.py'
```

`tests/package-structure.test.mjs` 检查 10 个 skill、包入口和本地文档引用；Python 测试覆盖文献 JSON 导入与 Pi 审稿门禁。`.aris/reviewer-sessions/` 含完整提示、输入文件内容和审稿结果，按项目私有研究数据管理。
