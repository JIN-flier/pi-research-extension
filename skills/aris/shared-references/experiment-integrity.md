# Experiment Integrity

Every claimed result must point to an existing metric file and its run configuration. Record dataset and split, seed count, baseline parity, evaluation type, and actual sample/condition scope. A tracker entry or model narration is not evidence of completion.

Declare one evaluation type for each result: `real_gt`, `synthetic_proxy`, `self_supervised_proxy`, `simulation_only`, or `human_eval`. A synthetic or self-supervised proxy supports only the corresponding proxy or relative claim. Never use predictions or baseline outputs as unstated ground truth, normalize by a method's own best score to manufacture an improvement, or describe a small pilot as comprehensive. Report raw values and any normalization rule together.

The executor can verify mechanical facts (files, hashes, parsed numbers, test status). An independent `aris_review` can critique code and interpretation when given the actual text files and result data. The reviewer cannot independently execute code or inspect images through text snapshots. Keep those scope limits in the verdict; see [reviewer independence](reviewer-independence.md) and [acceptance gate](acceptance-gate.md).
