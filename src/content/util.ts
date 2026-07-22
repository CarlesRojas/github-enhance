// Small helpers shared by content-script features.

/** Resolve when `predicate()` returns a truthy value, or null after `timeout` ms. */
export function waitFor<T>(
  predicate: () => T | null | undefined,
  timeout = 2000,
  interval = 50,
): Promise<T | null> {
  return new Promise((resolve) => {
    const immediate = predicate();
    if (immediate) {
      resolve(immediate);
      return;
    }
    const start = performance.now();
    const timer = window.setInterval(() => {
      const value = predicate();
      if (value) {
        window.clearInterval(timer);
        resolve(value);
      } else if (performance.now() - start >= timeout) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}

/** Case-insensitive, whitespace-collapsed text of an element. */
export function normText(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Find the first descendant (or self) whose trimmed text matches one of `labels`. */
export function findByText<T extends Element>(
  root: ParentNode | null | undefined,
  selector: string,
  labels: string[],
): T | null {
  if (!root) return null;
  const wanted = labels.map((l) => l.toLowerCase());
  const candidates = root.querySelectorAll<T>(selector);
  for (const el of candidates) {
    const text = normText(el);
    if (wanted.some((w) => text === w || text.startsWith(w))) return el;
  }
  return null;
}
