import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('Pi package exposes the reviewer extension and all ARIS skills', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.pi.extensions, ['./extensions/aris-reviewer.ts']);
  assert.deepEqual(manifest.pi.skills, ['./skills/aris']);
  assert.equal(fs.existsSync(path.join(root, 'extensions/aris-reviewer.ts')), true);
  assert.equal(fs.existsSync(path.join(root, 'extensions/aris-reviewer-core.mjs')), true);

  const skills = fs.readdirSync(path.join(root, 'skills/aris'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, 'skills/aris', entry.name, 'SKILL.md')));
  assert.equal(skills.length, 11);
  assert.equal(fs.existsSync(path.join(root, 'tools/research_wiki.py')), true);
});

test('project Pi settings load this package without duplicate direct resources', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.pi/settings.json'), 'utf8'));
  assert.deepEqual(settings.packages, ['../']);
  assert.equal(fs.existsSync(path.join(root, '.pi/extensions/aris-reviewer.ts')), false);
  assert.equal(fs.existsSync(path.join(root, '.pi/skills/aris')), false);
});
