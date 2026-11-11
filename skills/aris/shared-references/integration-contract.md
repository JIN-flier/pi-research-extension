# Pi Package Tool Paths

The Pi package declares `./skills/aris` and `./extensions/aris-reviewer.ts` in `package.json`. Its helpers live in the **installed ARIS package root** under `tools/`; the research project's working directory may have no `tools/` directory.

Resolve the package root from the loaded `skills/aris/<skill>/SKILL.md` path (three parent directories) or an explicit `ARIS_REPO` pointing to that root. Confirm the intended helper exists before invoking it. Run helpers from the research project directory and pass project-local paths for `research-wiki/`, `lit-search/`, `.aris/reviewer-sessions/`, and stage outputs. Do not search arbitrary parent directories or silently substitute a different script.

Current helpers are `capture_filter.py`, `literature_import.py`, `research_wiki.py`, `review_gate.py`, `threat_scan.py`, and `verify_wiki_coverage.sh`. `literature_import.py` consumes the literature plugin's JSON sidecar; `review_gate.py` consumes the Pi extension's saved reviewer session. If either dependency or expected input is absent, report the missing path and stop the affected operation.
