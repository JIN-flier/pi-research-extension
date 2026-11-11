# Compute Environment Contract

Use the **current research project's** environment notes and actual runtime facts for experiment execution. A plan must name the entry point, dependency specification, dataset and checkpoint locations, device needs, seed, expected output, and cost or time budget. If remote execution is requested, use only the connection and scheduler procedure supplied by that project.

Before a full run, verify imports, storage, device visibility, and a tiny deterministic forward/evaluation witness. Save a reproducible dependency snapshot or container/image reference and the exact launch command. For each attempt, keep code revision, arguments, seed, host or job ID, timestamps, stdout/stderr, and output path. Reusing a previous environment is safe only when its recorded specification matches the current one. A failed witness or missing output blocks a DONE status.

Diagnose failures by layer: dependency/specification, data/weights, device/kernel, launch procedure, or output parsing. Preserve failed attempts and re-run the witness after a fix. Do not infer a successful scientific result from a successful launch.
