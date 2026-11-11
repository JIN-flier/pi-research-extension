---
name: experiment-bridge
description: Implement a project experiment plan, validate code, run the first milestones, and hand results to analysis.
argument-hint: "[experiment-plan-path-or-topic]"
---

# Experiment Bridge

Turn **$ARGUMENTS** or `refine-logs/EXPERIMENT_PLAN.md` into executable runs. Use the current project's code and environment; do not assume a remote server, cloud provider, or repository that the user has not supplied.

## Inputs

Read `refine-logs/EXPERIMENT_PLAN.md`, `EXPERIMENT_TRACKER.md`, and `FINAL_PROPOSAL.md` where present. Extract the claims, datasets and splits, baselines, metrics, seeds, run order, budget, and success/failure criteria. If no usable plan exists, make the smallest explicit plan before running costly work. Preserve MUST-RUN versus NICE-TO-HAVE priorities.

## Implement and validate

1. Inspect the existing project entry points and reuse its data loaders and evaluation code. Implement the sanity run first, then baselines, main method, and decisive ablations. Make seeds and key hyperparameters configurable. Save machine-readable metrics and the exact run configuration.
2. Verify data split boundaries, evaluation direction and units, baseline parity, and output paths. Run focused tests or a tiny deterministic smoke run. Do not mark a run complete before its output files exist and parse.
3. For a meaningful independent code review, write a project-local dossier listing the plan, changed code files, test outputs, and questions about leakage, metric bugs, implementation fidelity, and reproducibility. Call `aris_review` with the dossier in `files`. The reviewer reads text snapshots only; include relevant source text in the dossier or list project-local text files explicitly. Capture actual `Reviewer-Model` and `threadId` from the response. On fixes, call again with the same `threadId` and revised files. See [review trace](../shared-references/review-tracing.md) and [reviewer independence](../shared-references/reviewer-independence.md). If review is unavailable, say so.
4. Use `/run-experiment` with the project's documented environment for M0 sanity before launching full runs. Inspect logs and metrics. Debug a failed run from its error and configuration; preserve failed evidence. Limit concurrency to the known compute budget. Only launch further milestones when M0 passes.
5. Collect initial results in `refine-logs/EXPERIMENT_RESULTS.md`, with run IDs, source paths, settings, numeric results, failures, and scope limits. Update `EXPERIMENT_TRACKER.md` from actual outputs. Handoff to `/analyze-results` and `/auto-review-loop` when appropriate.

Follow [experiment integrity](../shared-references/experiment-integrity.md), [output versioning](../shared-references/output-versioning.md), and [output language](../shared-references/output-language.md). Never infer a benchmark result from code or a tracker status.
