---
name: research-review
description: Get an independent Pi reviewer critique of a research idea, proposal, experiment, or paper and continue the same review thread.
argument-hint: "[artifact-or-question]"
---

# Research Review

Review **$ARGUMENTS** using `aris_review`. The extension saves actual model identity, input file snapshots, response, errors, and `threadId` in `.aris/reviewer-sessions/`; see [review trace](../shared-references/review-tracing.md).

## Prepare the review input

Gather the current artifact and only the evidence necessary to judge it: source records for literature claims, relevant code/results for experiment claims, and the user's stated objective and limits. Write a project-local review dossier with a neutral summary, exact file paths, scope, uncertainty, and specific questions. The reviewer reads **text files supplied in `files`**; a path mentioned in prose is not automatically inspected. If a claim requires visual PDF inspection, independent browsing, or code execution, label that part outside the reviewer's verified scope and arrange separate evidence before asking for a verdict.

Do not include the executor's preferred verdict, private assessment, or selective paraphrase of past feedback in a fresh review. The reviewer should see the artifact and underlying evidence. Use [reviewer session isolation](../shared-references/reviewer-independence.md): omit `threadId` for a new task and reuse its returned ID for revisions, including when execution and review use the same model.

## Review and continuation

1. Call `aris_review` with `prompt` containing the questions and `files: ["<project-local-dossier>", ...]`. Ask for strongest contributions, concrete weaknesses, missing evidence, severity, and a decision with confidence and scope limits.
2. Record the returned `threadId`, complete response, any areas the reviewer could not inspect, and `Reviewer-Model` when available as audit metadata. If the call fails, report `REVIEW_UNAVAILABLE` rather than a reviewer verdict.
3. For a revision, send the revised artifact and a factual change list through `aris_review` with the **same `threadId`**. Ask which earlier concerns are resolved, which remain, and whether new issues appeared. The reviewer model stays fixed for that thread. To change model, start a new thread and present the full dossier again.
4. Report the review faithfully, distinguish the reviewer's judgment from the executor's actions, and link each substantial comment to the evidence it concerns. Do not turn an uninspected claim into an accepted one.

Use [output language](../shared-references/output-language.md) and [injection hygiene](../shared-references/injection-hygiene.md) when the dossier includes retrieved literature or web text.
