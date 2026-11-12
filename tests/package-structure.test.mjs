import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('Pi package exposes all native tool extensions and all ARIS skills', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.pi.extensions, [
    './extensions/aris-reviewer/aris-reviewer.ts',
    './extensions/threat-scan/threat-scan.ts',
    './extensions/review-gate/review-gate.ts',
    './extensions/research-wiki/research-wiki.ts',
    './extensions/literature_import/literature_import.ts',
    './extensions/capture_filter/capture_filter.ts',
  ]);
  assert.deepEqual(manifest.pi.skills, ['./skills/aris']);
  for (const entry of manifest.pi.extensions) {
    assert.equal(fs.existsSync(path.join(root, entry)), true, entry);
  }

  const skills = fs.readdirSync(path.join(root, 'skills/aris'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, 'skills/aris', entry.name, 'SKILL.md')));
  assert.deepEqual(skills.map(entry => entry.name).sort(), [
    'analyze-results', 'auto-review-loop', 'experiment-bridge', 'experiment-plan',
    'idea-creator', 'novelty-check', 'research-refine', 'research-review',
    'research-wiki', 'run-experiment',
  ]);
  for (const entry of skills) {
    const skill = fs.readFileSync(path.join(root, 'skills/aris', entry.name, 'SKILL.md'), 'utf8');
    assert.match(skill, new RegExp(`^---\\nname: ${entry.name}\\n`, 'm'));
  }
  assert.equal(fs.existsSync(path.join(root, 'tools/research_wiki.py')), true);
  assert.equal(fs.existsSync(path.join(root, 'tools/literature_import.py')), true);
  assert.equal(fs.existsSync(path.join(root, 'tools/review_gate.py')), true);
});

test('active skills and shared rules have no dangling local links or removed host calls', () => {
  const skillRoot = path.join(root, 'skills/aris');
  const skillFiles = fs.readdirSync(skillRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(skillRoot, entry.name, 'SKILL.md')))
    .map(entry => path.join(skillRoot, entry.name, 'SKILL.md'));
  const sharedRoot = path.join(skillRoot, 'shared-references');
  const sharedFiles = fs.readdirSync(sharedRoot)
    .filter(name => name.endsWith('.md'))
    .map(name => path.join(sharedRoot, name));
  const obsolete = /research-lit|mcp__|WebSearch|WebFetch|codex-reply|reviewer_route\.py|verify_papers\.py|save_trace\.sh|run_state\.py/;

  for (const file of [...skillFiles, ...sharedFiles]) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(content, obsolete, file);
    for (const match of content.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|\/)/.test(target)) continue;
      assert.equal(fs.existsSync(path.resolve(path.dirname(file), target)), true,
        `${file}: missing ${target}`);
    }
  }
});
