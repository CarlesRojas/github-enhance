// Feature (part of the Layout group): hide GitHub's "Community Guidelines"
// reminder and the "ProTip!" line shown around the bottom of the conversation.
//
// Both are small blocks of an icon + text. We hide the whole block (so the
// icon goes too), matching the guidelines note by its docs link and the ProTip
// by its `.protip` container / leading text, and never touching text inside
// actual comments. Reversible: un-hide anything we marked when turned off.

import { Settings } from '../../shared/settings';
import { normText } from '../util';

const MARK = 'data-ghe-notice';

function inComment(el: Element): boolean {
  return !!el.closest('.comment-body, .markdown-body, .js-comment-body, td.comment-body');
}

function hide(el: HTMLElement | null): void {
  if (!el || el.hasAttribute(MARK) || inComment(el)) return;
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

  // Community Guidelines reminder — hide the whole block (icon + text) via its
  // link. The note is a <div> wrapping an <svg> and a <span>, so climb to the
  // nearest block rather than hiding just the text span.
  document
    .querySelectorAll<HTMLElement>('a[href*="community-guidelines" i]')
    .forEach((a) => hide(a.closest<HTMLElement>('div, p, li') ?? a.parentElement));

  // ProTip block.
  document
    .querySelectorAll<HTMLElement>('.protip, .tip')
    .forEach((el) => hide(el));

  // Fallback for a ProTip rendered as a plain paragraph.
  document.querySelectorAll<HTMLElement>('p').forEach((el) => {
    if (el.hasAttribute(MARK)) return;
    if (normText(el).startsWith('protip')) hide(el.closest<HTMLElement>('.protip') ?? el);
  });
}
