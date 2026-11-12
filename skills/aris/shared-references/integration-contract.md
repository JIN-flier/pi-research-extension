# Pi Tools and Package Paths

The Pi package declares `./skills/aris` and three extension entries in `package.json`: `extensions/aris-reviewer/aris-reviewer.ts`, `extensions/threat-scan/threat-scan.ts`, and `extensions/review-gate/review-gate.ts`. They register **`aris_review`**, **`threat_scan`**, and **`review_gate`**. These are native Pi tool calls, not shell commands or slash commands. After extension changes, reload Pi with `/reload`.

Use `threat_scan` with the actual text in `content`, explicit `scope: "strict"` for persistence or reuse, and `action: "scan"` or `"quarantine"`. It takes no file path and never reads or writes files. `quarantine` returns a placeholder on a hit and the original text when clean; the caller preserves the source separately. See [external content hygiene](injection-hygiene.md).

Use `review_gate` with `sessionPath` and optional `reviewScopeComplete`. It checks the latest round's completion and Score/Verdict and requires interactive human confirmation of scope for acceptance. Missing UI or declined confirmation returns `review_unavailable`; never bypass this using a CLI. See [acceptance gate](acceptance-gate.md). If a required native tool is missing, report the missing extension and stop the dependent operation (optional wiki context may be skipped).

Python helpers live in the **installed ARIS package root** under `tools/`; the research project's working directory may have no `tools/` directory.

Resolve the package root from the loaded `skills/aris/<skill>/SKILL.md` path (three parent directories) or an explicit `ARIS_REPO` pointing to that root. Confirm the intended helper exists before invoking it. Run helpers from the research project directory and pass project-local paths for `research-wiki/`, `lit-search/`, `.aris/reviewer-sessions/`, and stage outputs. Do not search arbitrary parent directories or silently substitute a different script.

Current helpers are `capture_filter.py`, `literature_import.py`, `research_wiki.py`, and `verify_wiki_coverage.sh`. `literature_import.py` consumes the literature plugin's JSON sidecar. `threat_scan.py` remains an internal Python dependency of wiki helpers, and `review_gate.py` remains for legacy CLI compatibility; agent-facing skills use the native tools above. If a helper dependency or expected input is absent, report the missing path and stop the affected operation.
