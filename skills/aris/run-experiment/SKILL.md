---
name: run-experiment
description: Run a planned experiment in the current project's documented environment and preserve reproducible logs and results.
argument-hint: "[run-id-or-command]"
---

# Run Experiment

Execute **$ARGUMENTS** from `refine-logs/EXPERIMENT_TRACKER.md` or a user-supplied command. Read the project's actual environment documentation, scheduler configuration, dataset paths, credentials arrangement, and compute budget. Do not assume a particular cloud provider or start a paid remote instance from a guessed setting. Apply [compute environment](../shared-references/compute-env-contract.md) and [experiment integrity](../shared-references/experiment-integrity.md).

## Preflight

1. Resolve the run ID to its exact code revision, entry point, arguments, dataset version/split, seed, baseline or method variant, and expected output location. If any required input is missing, identify it before launch.
2. Inspect available CPU/GPU/storage and dependency versions using the project's documented environment. Confirm data and checkpoint paths, write permission, disk space, and whether the expected metric script runs. Record the environment spec or a reproducible dependency snapshot. Use a tiny deterministic smoke run when the environment or code changed.
3. Estimate runtime and resource cost against the stated budget. For remote execution, use only the project's supplied connection and scheduler procedure. Keep the exact launch command and remote job ID. Avoid duplicate submission if an earlier job is still running.

## Launch and verify

Run the smallest sanity milestone first. Capture stdout/stderr to a persistent log, plus start time, host/device, code revision, seed, config, and job ID. Check that the process started, then verify a real output artifact appears and parses. A launch command returning successfully does not mean the experiment completed.

On failure, preserve the log and configuration, diagnose the failing layer, and record the attempt. Fix the cause, rerun the smoke check, and launch a new attempt with a distinct output path. Do not overwrite failed evidence. Do not run a broad matrix until the sanity run has passed.

After completion, verify exit status, dataset/split, all expected output files, finite numeric metrics, and the declared evaluation type (`real_gt`, `synthetic_proxy`, `self_supervised_proxy`, `simulation_only`, or `human_eval`). Record the exact scope: samples, seeds, conditions, and missing runs. Update `refine-logs/EXPERIMENT_TRACKER.md` to DONE only for verified outputs, and write the result path and metric source. A failed or partial job stays FAILED or PARTIAL.

Pass the observed files to `/analyze-results`. Keep claimed numbers tied to their saved result files; never use a tracker row or a model's narration as evidence of a completed run.
