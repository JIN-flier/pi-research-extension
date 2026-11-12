# Pi Tools and Package Paths

The Pi package declares `./skills/aris` and native extensions in `package.json`. They register **`aris_review`**, **`threat_scan`**, **`review_gate`**, **`research_wiki`**, **`literature_import`**, and **`capture_filter`**. These are native Pi tool calls, not shell commands or slash commands. After extension changes, reload Pi with `/reload`.

Use `threat_scan` with the actual text in `content`, explicit `scope: "strict"` for persistence or reuse, and `action: "scan"` or `"quarantine"`. It takes no file path and never reads or writes files. `quarantine` returns a placeholder on a hit and the original text when clean; the caller preserves the source separately. See [external content hygiene](injection-hygiene.md).

Use `review_gate` with `sessionPath` and optional `reviewScopeComplete`. It checks the latest round's completion and Score/Verdict and requires interactive human confirmation of scope for acceptance. Missing UI or declined confirmation returns `review_unavailable`; never bypass this using a CLI. See [acceptance gate](acceptance-gate.md). If a required native tool is missing, report the missing extension and stop the dependent operation (optional wiki context may be skipped).

The wiki tools resolve relative paths against the research project's working directory. The project's `research-wiki/` and `lit-search/` directories stay in that project, not in the installed package.

Pass project-local paths for `research-wiki/`, `lit-search/`, `.aris/reviewer-sessions/`, and stage outputs. Do not search arbitrary parent directories or silently substitute a different helper.

`literature_import` consumes the literature plugin's JSON sidecar. Python scripts under `tools/` remain for legacy CLI compatibility, and `verify_wiki_coverage.sh` remains a diagnostic. If a native tool or expected input is absent, report it and stop the affected operation.
