import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Keep long requests, file lists and reviewer scope limits reachable in the
 * terminal viewport. The native confirm dialog has a non-scrolling title. */
export function createScopeConfirmationView(
  message: string,
  terminalRows: () => number,
  requestRender: () => void,
  done: (confirmed: boolean) => void,
  signal?: AbortSignal,
) {
  let offset = 0;
  let lastWidth = 80;
  let finished = false;
  const finish = (confirmed: boolean) => {
    if (finished) return;
    finished = true;
    signal?.removeEventListener("abort", onAbort);
    done(confirmed);
  };
  const onAbort = () => finish(false);
  const layout = () => {
    const lines = message.split("\n").flatMap(line => wrapTextWithAnsi(line, lastWidth));
    const height = Math.max(1, terminalRows() - 6);
    const maxOffset = Math.max(0, lines.length - height);
    offset = Math.min(offset, maxOffset);
    return { lines, height, maxOffset };
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) finish(false);
  return {
    render(width: number): string[] {
      lastWidth = Math.max(1, width);
      const { lines, height } = layout();
      return [
        truncateToWidth("Confirm Reviewer Scope", lastWidth),
        truncateToWidth(`Lines ${offset + 1}-${Math.min(lines.length, offset + height)} / ${lines.length}`, lastWidth),
        ...lines.slice(offset, offset + height),
        truncateToWidth("↑↓ / PgUp/PgDn scroll | Enter confirm | Esc decline", lastWidth),
      ];
    },
    handleInput(data: string): void {
      const { height, maxOffset } = layout();
      if (matchesKey(data, Key.escape)) { finish(false); return; }
      if (matchesKey(data, Key.enter)) { finish(true); return; }
      if (matchesKey(data, Key.down)) offset = Math.min(maxOffset, offset + 1);
      else if (matchesKey(data, Key.up)) offset = Math.max(0, offset - 1);
      else if (matchesKey(data, Key.pageDown)) offset = Math.min(maxOffset, offset + height);
      else if (matchesKey(data, Key.pageUp)) offset = Math.max(0, offset - height);
      else if (matchesKey(data, Key.end)) offset = maxOffset;
      else if (matchesKey(data, Key.home)) offset = 0;
      requestRender();
    },
    invalidate(): void {},
    dispose(): void { signal?.removeEventListener("abort", onAbort); },
  };
}
