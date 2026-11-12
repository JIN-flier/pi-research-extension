import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { createScopeConfirmationView } from '../extensions/review-gate/scope-confirmation.ts';

test('long scope evidence can be scrolled without hiding the confirmation controls', () => {
  const lines = Array.from({ length: 80 }, (_, i) => `File ${i}: 审查版本 ${i}`);
  let answer;
  const view = createScopeConfirmationView(lines.join('\n'), () => 12, () => {}, value => { answer = value; });
  const first = view.render(40);
  assert.ok(first.length <= 12);
  assert.match(first.join('\n'), /File 0/);
  assert.doesNotMatch(first.join('\n'), /File 79/);
  view.handleInput('\u001b[F'); // End
  const last = view.render(40);
  assert.ok(last.length <= 12);
  assert.match(last.join('\n'), /File 79/);
  assert.match(last.join('\n'), /Enter.*confirm/);
  for (const line of view.render(18)) assert.ok(visibleWidth(line) <= 18);
  view.handleInput('\r');
  assert.equal(answer, true);
  view.dispose();
});

test('escape and cancellation decline the displayed scope', () => {
  for (const cancel of ['escape', 'abort']) {
    let answer;
    const controller = new AbortController();
    const view = createScopeConfirmationView('Scope', () => 20, () => {}, value => { answer = value; }, controller.signal);
    if (cancel === 'escape') view.handleInput('\u001b');
    else controller.abort();
    assert.equal(answer, false);
    view.dispose();
  }
});
