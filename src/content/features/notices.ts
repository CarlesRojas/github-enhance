// Feature (part of the Layout group): hide GitHub's "Community Guidelines"
// reminder and the "ProTip!" line shown around the bottom of the conversation.
//
// Matched by content (the guidelines note links to the community-guidelines
// docs; the ProTip line starts with "ProTip!"), never touching text inside
// actual comments. Reversible: un-hide anything we marked when turned off.

import { Settings } from '../../shared/settings';
import { normText } from '../util';

const MARK = 'data-ghe-notice';

function inComment(el: Element): boolean {
  return !!el.closest('.comment-body, .markdown-body, .js-comment-body, td.comment-body');
}

function hide(el: HTMLElement): void {
  if (el.hasAttribute(MARK)) return;
  el.style.setProperty('display', 'none', 'important');
  el.setAttribute(MARK, '');
}

export function applyNotices(settings: Settings): void {
  if (!settings.layout.hideNotices) {
    document.querySelectorAll<HTMLElement>(`[${MARK}]`).forEach((el) => {
      el.style.removeProperty('display');
      el.removeAttribute(MARK);
    });
    return;
  }

  // Community Guidelines reminder — identified by its link.
  document
    .querySelectorAll<HTMLElement>('a[href*="community-guidelines" i]')
    .forEach((a) => {
      const block = a.closest<HTMLElement>('p') ?? (a.parentElement as HTMLElement | null);
      if (block && !inComment(block)) hide(block);
    });

  // ProTip line (and any stray guidelines paragraph).
  document
    .querySelectorAll<HTMLElement>('p, .protip, [class*="protip" i], .tip')
    .forEach((el) => {
      if (el.hasAttribute(MARK) || inComment(el)) return;
      const t = normText(el);
      if (t.startsWith('protip') || t.includes('community guidelines')) {
        hide(el.closest<HTMLElement>('.protip, .tip') ?? el);
      }
    });
}
