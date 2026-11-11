# ARIS for Pi

This repository is an installable Pi package. Its reviewer extension and 11
ARIS skills live in the package rather than in Pi's project resource folders.
The shared references and Python helpers come from
[`wanshuiyin/Auto-claude-code-research-in-sleep`](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)
at commit `f76ec8d6b77792e2242cca049e08d0cbb7d54e19`. Reviews use the
extension in `extensions/aris-reviewer.ts`.

```text
extensions/           Pi extension and reviewer core
skills/aris/          11 ARIS skills and shared references
tools/                Python and shell helpers used by the skills
tests/                Package and reviewer core tests
.pi/settings.json     Loads this package while developing in this directory
.aris/                Project-local reviewer settings and research output
```

## Develop and install

From this directory, run `node --test tests/*.test.mjs` to check the package
structure and reviewer helpers. Start Pi here with `pi`;
`.pi/settings.json` loads the package from its source directory, so edits can
be picked up with `/reload`. Pi runs the TypeScript extension directly; no
build step is required. For optional TypeScript checking, install the listed
development dependencies and run `npm run typecheck`.

Once this repository is pushed to GitHub, install it from another project with
Pi's Git package source (replace `OWNER/REPO` with the GitHub repository):

```bash
pi install git:github.com/OWNER/REPO --local
```

For local development before pushing, run the following command from the
target project's directory, replacing the path with this repository's
absolute path:

```bash
pi install /absolute/path/to/ARIS --local
```

Pi loads the extension and skills from the package. The extension sets
`ARIS_REPO` to the package root when it is not already set, allowing skill
scripts to find the bundled `tools/` directory. Reviewer configuration and
review sessions remain in the active project's `.aris/` directory.

## Choose a reviewer model

1. Start Pi in the project where ARIS is installed and authenticate your chosen provider using
   `/login` or its API key environment variable. Pi supports multiple providers.
2. Browse models with `/model`.
3. Run `/aris-reviewer provider/model`, such as a model available in your own
   Pi catalog. This saves only the model name in `.aris/reviewer.json`.
4. Run an ARIS skill, for example `/skill:research-refine`.

You can change the reviewer at any time with `/aris-reviewer`. New review
threads use the new model; an existing thread retains its saved conversation
and model. The `aris_review` tool also accepts an optional `model` override
for a new thread. It returns `threadId` for follow-up rounds and saves the
conversation in `.aris/reviewer-sessions/`.

The Pi reviewer reads project-local text files provided through its `files`
argument. Reviews requiring visual PDF/image inspection, independent web
search, or command execution need an additional capable review route.

Within these skills, map Claude Code tool names to Pi's tools: `WebSearch` to
`web_search` and `WebFetch` to `web_fetch` from the installed `pi-web-access`
package; `Read`, `Write`, `Edit`, `Grep`, and `Bash` to Pi's corresponding file
and shell tools. Optional Zotero/Obsidian MCP sources still require their own
connections.

ARIS evidence and run files under `.aris/` may contain research data. Keep
`.aris/reviewer-sessions/` out of version control when using this project in a
repository.

ARIS研究流程：

**明确方向 → 文献调研 → 产生候选 idea → 查新 → 细化方案 → 设计实验 → 实现与运行 → 分析结果 → 审稿与迭代 → 写作。**

下面按一次机器学习研究项目来说明。你可以跳过已经完成的阶段；例如已有明确方法时，可以直接从 `research-lit` 或 `research-refine` 开始。

在使用 ARIS 的项目目录启动 Pi；如果直接在本仓库开发，进入仓库目录即可：

```bash
cd /path/to/your/project
pi
```

以下 `/skill:...` 是 **Pi 对话中的命令**。建议每次启动一个阶段，并在进入下一阶段前检查输出。

在 Pi 中先用 `/login` 配置你选的模型供应商，再通过 `/model` 查看可用模型、设置主模型，并选择 reviewer：

```text
/aris-reviewer provider/model
```

主模型负责组织研究、实现代码；reviewer 对方案和结果提出独立意见。若希望获得不同模型家族的视角，可以为两者选择不同家族。当前 reviewer 适配支持审阅传入的文本材料；需要直接查看 PDF 图像、独立联网或执行命令的审稿步骤，需要具备相应能力的其他工具。

---

1. **建立研究背景和知识库：`research-wiki`**

   如果这是持续数周或更久的项目，建议先建立知识库，用来保存论文、idea、实验和研究主张之间的关系。

   ```text
   /skill:research-wiki init
   ```

   后续可以查询或更新：

   ```text
   /skill:research-wiki query "我目前研究方向有哪些关键方法和未解决问题？"
   ```

   **得到什么：** 项目内的 `research-wiki/`，供后续文献调研和 idea 生成使用。如果只是快速探索一个问题，这一步可以跳过。

2. **摸清研究现状：`research-lit`**

   提供研究方向、任务场景和你关心的问题。明确指定文献来源有助于检查哪些来源真正参与了搜索。

   ```text
   /skill:research-lit "面向长文档的检索增强生成：
   调研现有方法、主要基准、评估指标和仍未解决的问题。
   优先关注近两年的论文，同时列出必要的经典工作。
   — sources: web, semantic-scholar"
   ```

   **得到什么：** 文献清单、方法分类、相关工作对比和研究空白。进入下一步前，检查引用是否已验证，并重点阅读最接近你方向的几篇原文；标记为 `[UNVERIFIED]` 的条目需要进一步核实。

3. **生成和筛选研究方向：`idea-creator`**

   ```text
   /skill:idea-creator "基于刚才的文献调研，围绕长文档 RAG 生成研究 idea。
   约束：单张 24GB GPU，可使用公开数据，预计研究周期 2 个月。
   请比较新颖性、可行性、主要风险和最小验证实验。"
   ```

   **得到什么：** 排序后的候选 idea、理由和初步验证方式。选择一个主方向，再保留一两个备选方向。

   这个 skill 的原始流程可能包括小规模 pilot。你可以明确写上“**本阶段只生成和筛选 idea，暂不启动实验**”，等检查完方案再运行。

4. **针对选中 idea 查新：`novelty-check`**

   `idea-creator` 的流程可能已经做过查新；对最终选定的 idea 再做一次更聚焦的核查尤其有用。

   ```text
   /skill:novelty-check "研究问题：……。
   核心方法：……。
   我认为的主要创新点：……。
   请逐项查找最接近的已有工作，并给出明确的差异和可能的重叠。"
   ```

   **得到什么：** 与最接近论文的对照、重叠程度和继续推进的建议。这里重点看**具体论文和具体差异**，不要只看“有创新”或“无创新”的结论。

5. **把 idea 变成可实现的方法：`research-refine`**

   ```text
   /skill:research-refine "PROBLEM: 当前长文档 RAG 在……情况下失败。
   APPROACH: 我准备通过……机制解决。
   约束：单张 24GB GPU、两个月、优先使用公开数据和现有基线。
   请输出核心假设、方法设计、与最接近工作的区别、失败条件及最小验证。"
   ```

   **得到什么：** 更具体的研究问题、方法机制、核心主张和初步验证思路。该 skill 会使用已配置的 reviewer 反复审视方案。

   完成后应能回答：**方法究竟改变了什么、预计改善什么、什么实验结果会推翻它？**

6. **按研究主张设计实验：`experiment-plan`**

   ```text
   /skill:experiment-plan "基于刚才的研究方案制定实验计划。
   请覆盖主实验、基线、消融、统计重复、失败分析及算力预算，
   并区分必须完成和有时间再做的实验。"
   ```

   **得到什么：** 实验矩阵、运行顺序、评估协议和预算。`experiment-bridge` 优先读取 `refine-logs/EXPERIMENT_PLAN.md`；如果输出在别处，调用下一步时给出实际路径即可。

   此时值得检查每个核心主张是否都有对应实验，以及是否存在能反驳该主张的对照。

7. **实现方法并跑通最小实验：`experiment-bridge`**

   ```text
   /skill:experiment-bridge "根据 refine-logs/EXPERIMENT_PLAN.md 实现实验。
   基础代码仓库：<你的代码路径或仓库地址>。
   先检查环境并完成最小数据集上的 sanity check，暂不启动完整训练。"
   ```

   **得到什么：** 可运行的实验代码、环境检查结果和初步运行结果。这个 skill 的设计范围包含实现、部署和初始实验，所以建议在请求中写清代码仓库、运行环境、GPU 和预算边界。

   当前安装的 skill 文本也会提到 `/experiment-queue` 等其他上游 skill；这些不在当前的 11 个 skill 中。遇到大规模队列需求时，需要另行配置，或者将任务拆成当前 `run-experiment` 能处理的批次。

8. **运行正式实验：`run-experiment`**

   最小实验通过后，再提供明确的运行位置、命令和资源限制：

   ```text
   /skill:run-experiment "在本地 GPU 上运行实验计划中的主实验和基线。
   每组使用 3 个随机种子；先检查磁盘、显存和依赖。
   将配置、日志、指标和 checkpoint 保存到项目目录。"
   ```

   **得到什么：** 实验运行记录、日志、指标和模型输出。该 skill 也支持远程机器及云 GPU；使用云资源时，在请求中明确实例、预算、运行时长和停止条件。

9. **分析实验结果：`analyze-results`**

   ```text
   /skill:analyze-results "分析 results/ 下的主实验、基线和消融结果。
   统计各随机种子的均值和标准差，比较成本与效果，
   并指出哪些核心主张得到支持、哪些证据不足。"
   ```

   **得到什么：** 指标汇总、比较表、趋势和待解释的问题。让它同时列出失败和负面结果；若结果与假设不符，可以回到 `research-refine` 或 `experiment-plan` 调整。

10. **进行一次深入审稿：`research-review`**

    可以在方案阶段先审一次，也可以在有结果后再审：

    ```text
    /skill:research-review "审阅当前研究方案和实验结果。
    请检查问题定义、新颖性、实验设计、结果是否支持结论、
    潜在数据泄漏以及最可能被审稿人质疑的地方。
    请引用项目中具体的方案和结果文件。"
    ```

    **得到什么：** 一份集中、深入的批评性反馈。Pi reviewer 的 `files` 输入目前以项目内文本文件为主；若论证依赖图表视觉细节或 PDF 排版，需要额外提供可读材料或使用相应工具。

11. **根据反馈迭代：`auto-review-loop`**

    如果希望按“审稿 → 修改 → 再审”的方式连续推进：

    ```text
    /skill:auto-review-loop "基于当前方案、代码和已有实验结果进行迭代。
    最多 3 轮；每轮先列出问题和拟修改内容。
    不启动新的付费云资源；新增实验先说明预算和目的。"
    ```

    **得到什么：** 多轮审稿与修改记录、剩余问题以及后续实验建议。它的范围可能涉及修改代码或触发实验，因此建议明确最大轮数、可修改范围和资源预算。

    已有新结果时，可以再次运行 `analyze-results`，再视情况进行 `research-review`。研究流程通常会在这几步之间循环。

---

一个可直接套用的最短顺序是：

```text
/skill:research-wiki init
/skill:research-lit <研究方向与文献范围>
/skill:idea-creator <方向与资源约束>
/skill:novelty-check <选中的 idea>
/skill:research-refine <问题和方法>
/skill:experiment-plan <研究方案>
/skill:experiment-bridge <实验计划和代码仓库>
/skill:run-experiment <运行范围与资源限制>
/skill:analyze-results <结果目录>
/skill:research-review <方案和结果>
/skill:auto-review-loop <迭代范围>
```

**写论文还需要单独安排。** 当前这 11 个 skill 覆盖研究、实验和审稿，没有完整的论文写作流水线。你可以在 Pi 中根据已经验证的方案、实验表格和引用，请主模型起草论文；再用 `research-review` 审阅文本。提交前仍需人工核查引用、数字、图表和结论是否与原始实验一致。
