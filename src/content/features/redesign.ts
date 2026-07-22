// Appearance: the pull-request page redesign, behind a single toggle.
//
// The content script only flips one attribute on <html> — every visual change
// lives in content.css under `html[data-ghe-redesign]`, expressed with
// GitHub's own color tokens so all native themes work automatically. Applied
// only on pull-request pages, and cleared on soft (Turbo) navigation away.

import { Settings } from '../../shared/settings';
import { isPRPage } from '../util';

const ATTR = 'data-ghe-redesign';

export function applyRedesign(settings: Settings): void {
  document.documentElement.toggleAttribute(
    ATTR,
    settings.appearance.redesign && isPRPage(),
  );
}
