**删除 `research-lit`，由 `pi-literature-review` 接管论文搜索、选择、下载和 PDF 综合**。ARIS 保留 10 个研究决策类 skills；需要查论文的 skill 直接调用插件的 `pi-literature-search` 工具。一般网页资料使用 `pi-web-access` 的 `web_search`、`fetch_content`。这两个插件的职责和工具入口见各自说明：[pi-literature-review](https://github.com/flindenberger/pi-literature-review)、[pi-web-access](https://github.com/nicobailon/pi-web-access)。

以下是文件级整理方案。

## 一、删除重复的文献检索层

| 删除                                                                                                                                                                                                                                                                                                                           | 原因                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [research-lit/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/research-lit/SKILL.md) 及其目录                                                                                                                                                                                                                            | 搜索来源选择、论文抓取、PDF 阅读和综述与 `pi-literature-review` 重叠。删除后 ARIS 从 11 个 skills 变为 10 个。                            |
| [arxiv_fetch.py](/home/flier/agent/pi-agent/ARIS/tools/arxiv_fetch.py)、[semantic_scholar_fetch.py](/home/flier/agent/pi-agent/ARIS/tools/semantic_scholar_fetch.py)、[openalex_fetch.py](/home/flier/agent/pi-agent/ARIS/tools/openalex_fetch.py)、[deepxiv_fetch.py](/home/flier/agent/pi-agent/ARIS/tools/deepxiv_fetch.py) | 论文数据库检索改由 `pi-literature-search` 执行。DeepXiv 若有插件未覆盖的独有用途，应作为以后单独需求处理。                                |
| [exa_search.py](/home/flier/agent/pi-agent/ARIS/tools/exa_search.py)、[firecrawl_search.py](/home/flier/agent/pi-agent/ARIS/tools/firecrawl_search.py)、[keenable_search.py](/home/flier/agent/pi-agent/ARIS/tools/keenable_search.py)                                                                                         | 一般网页搜索与读取交给 `pi-web-access`。                                                                                                  |
| [verify_papers.py](/home/flier/agent/pi-agent/ARIS/tools/verify_papers.py)                                                                                                                                                                                                                                                     | 插件已对其搜索记录做标识符核验。ARIS 的规则改为：**只有插件返回的记录才能作为已核验论文引用**；从普通网页发现的论文须再交给文献插件确认。 |

这里要保留一道边界：`pi-web-access` 找到的网页或论文线索，不能直接变成“已核验论文”；`novelty-check` 和 `idea-creator` 应使用文献插件核实书目，再作研究判断。

## 二、必须修改的 10 个 skills

| 文件                                                                                                 | 具体修改                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [idea-creator/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/idea-creator/SKILL.md)           | 删除“内联 WebSearch 文献调查”、`/research-lit` 链接及 `verify_papers.py` 调用；改为使用 `pi-literature-search` 的结果生成候选 idea。保留候选排序、研究空白判断和独立 reviewer。删除文中不存在于本包的 `/idea-discovery` 默认编排承诺。 |
| [novelty-check/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/novelty-check/SKILL.md)         | 用 `pi-literature-search` 查最接近工作；`web_search` 只补查非论文资料。删除 `verify_papers.py` 规则，要求逐条保留插件返回的 DOI/arXiv ID、来源和检索记录。                                                                             |
| [research-wiki/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/research-wiki/SKILL.md)         | 删除“`/research-lit` 完成后自动入库”的 Hook，以及 `/arxiv`、`/deepxiv` 等未收录 skill 的说明。改为“导入 `lit-search` JSON 结果”，明确只导入用户选定的论文。                                                                            |
| [research-refine/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/research-refine/SKILL.md)     | 文献依据读取插件产物；移除 WebSearch、Codex MCP 和多后端审稿示例，统一使用 `aris_review`。                                                                                                                                             |
| [experiment-plan/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/experiment-plan/SKILL.md)     | 基线论文从插件已核验记录选择；需要在线补查时明确调用哪一个 Pi 插件工具。                                                                                                                                                               |
| [experiment-bridge/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/experiment-bridge/SKILL.md) | 保留实验计划到实现的职责；删除其他宿主的 reviewer 路由，统一用 `aris_review`。                                                                                                                                                         |
| [run-experiment/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/run-experiment/SKILL.md)       | 去掉 Claude 专用配置文件和本包没有的 `/serverless-modal` 调用承诺；以当前项目提供的运行环境信息为输入。                                                                                                                                |
| [analyze-results/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/analyze-results/SKILL.md)     | 主要保留；检查输出是否错误引用已删除的文献检索流程。                                                                                                                                                                                   |
| [research-review/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/research-review/SKILL.md)     | 删除 Codex、Claude、Grok、手动 MCP 的调用说明，统一用 `aris_review`；保留独立审稿的输入范围、判定与续接规则。                                                                                                                          |
| [auto-review-loop/SKILL.md](/home/flier/agent/pi-agent/ARIS/skills/aris/auto-review-loop/SKILL.md)   | 删除 Copilot 原生审稿、Codex MCP、后端探测和回退树；只保留 Pi reviewer 的“审稿→修改→再审”状态机。                                                                                                                                      |

这一步应**重写旧 skill 的相关章节**，不能只替换工具名。旧文档有大量 `allowed-tools: WebSearch`、`mcp__...`、`Agent(...)` 和 `backend=codex` 的例子，留着会继续诱导 Pi 走错误路径。

## 三、知识库与 reviewer 代码

建议保留 [research_wiki.py](/home/flier/agent/pi-agent/ARIS/tools/research_wiki.py)，新增一个小型 `tools/literature_import.py`：

- 读取 `pi-literature-review` 生成的 `lit-search/*.json`。
- 只接受插件实际返回的标题、作者、年份、DOI、arXiv ID 和来源。
- 按 DOI 或 arXiv ID 去重，重复导入应幂等。
- 在 wiki 节点记录原 JSON 文件及记录 ID，方便回查。
- 遇到未知 JSON 结构时报错并保留原文件，不让模型猜字段。

保留 [aris-reviewer.ts](/home/flier/agent/pi-agent/ARIS/extensions/aris-reviewer.ts) 和核心模块；把 Pi reviewer 的实际模型、输入文件、`threadId`、结果和错误状态写入审稿记录。完成这一点后，才能删除 [save_trace.sh](/home/flier/agent/pi-agent/ARIS/tools/save_trace.sh)。将 [review_gate.py](/home/flier/agent/pi-agent/ARIS/tools/review_gate.py) 精简为 Pi 结果判定，再删除 [reviewer_route.py](/home/flier/agent/pi-agent/ARIS/tools/reviewer_route.py) 和 [copilot_native_evidence.py](/home/flier/agent/pi-agent/ARIS/tools/copilot_native_evidence.py)。

## 四、删除与 Pi package 无关的上游维护文件

这些文件不应留在最终 Pi 包的 `tools/` 中：

- **其他宿主安装与更新：** `install_aris.sh`、`install_aris.ps1`、`install_aris_codex.sh`、`install_aris_copilot.sh`、`smart_update.sh`、`smart_update.ps1`、`smart_update_codex.sh`、`smart_update_copilot.sh`、`skill_picker.py`、`skill-groups.tsv`。
- **Codex、Claude 与上游仓库维护：** `audit_codex_invocation.py`、`probe_codex_invocation.py`、`convert_skills_to_llm_chat.py`、`generate_codex_claude_review_overrides.py`、`check_skills_inventory.py`、`lint_skills_helpers.sh`、`requirements-codex-policy-audit.txt`、整个 `tools/meta_opt/`。
- **没有本体的兼容入口：** `figure_renderer.py`、`paper_illustration_image2.py`、整个 `tools/experiment_queue/`。
- **当前 10 个 skill 没有完整入口的上游功能：** `forensics_gate.py`、`idea_discovery_gate.py`、`iteration_log.py`、`watchdog.py`、`verify_paper_audits.sh`、`overleaf_audit.sh`、`overleaf_setup.sh`、`extract_paper_style.py`、`evidence_check.py`。

`run_state.py` 与 `provenance.py` 是一组依赖。当前保留的 skills 没有明确的调用入口；若不准备在这次改造中实现可恢复的 Pi 研究流水线，两者一起删除。`capture_filter.py`、`threat_scan.py` 和 `verify_wiki_coverage.sh` 则先保留，分别服务 wiki 写入与覆盖检查。

## 五、共享规则、README 和测试

`shared-references/` 需要随调用者一起清理：

- **删除：** `reviewer-backends.md`、`reviewer-routing.md`、`wiki-helper-resolution.md`、`fan-out-pattern.md`，以及专利格式、专利写作、投稿写作等当前 10 个 skills 不使用的资料。若删除 `run_state.py`，再删除 `resumable-runs.md`、`skill-governance.md`。
- **重写：** `citation-discipline.md` 改用文献插件的核验结果；`review-tracing.md` 改为 Pi 扩展的记录格式；`integration-contract.md` 缩成包内工具路径说明；`injection-hygiene.md` 更新为插件产物进入 wiki 的检查规则。
- **保留并核对引用：** 输出版本、清单、语言、实验环境、实验诚信、审稿独立性和接受门禁等仍服务于研究流程的规则。

[README.md](/home/flier/agent/pi-agent/ARIS/README.md) 要把“11 个 skill”改为“10 个”，删除 `/skill:research-lit` 示例，将文献阶段写为插件的 `/lit-search → /lit-selection → /lit-synthesis`。说明 ARIS 所需的插件及安装方式，并更新最短工作流。[package.json](/home/flier/agent/pi-agent/ARIS/package.json) 仍声明 `./skills/aris`，通常不必逐项列出 skill；[package-structure.test.mjs](/home/flier/agent/pi-agent/ARIS/tests/package-structure.test.mjs) 的数量断言改为 10，并删除它对当前不存在的 `.pi/settings.json` 的要求。

## 执行顺序

1. 先改 `idea-creator`、`novelty-check`、`research-wiki`，让它们能消费插件的真实输出。
2. 完成 JSON→wiki 导入和 Pi reviewer 留痕，验证论文身份与审稿续接。
3. 删除 `research-lit`、旧检索脚本和其他宿主脚本。
4. 清理共享规则、README、测试和悬空引用。
5. 在空项目安装三个 Pi packages，验证：论文搜索→选文→wiki 入库→idea→查新→独立审稿；再验证缺少任一插件时给出明确提示。

验收时应对 `skills/`、`extensions/`、`tools/` 全量搜索 `research-lit`、`mcp__`、`WebSearch`、`WebFetch`、`codex-reply` 及已删文件名。结果要么为零，要么是明确标注的历史资料；最终 package 不应把历史资料作为运行指令。
