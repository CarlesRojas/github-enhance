// Runs at document_start, before GitHub's page is parsed: applies the
// settings-only part of every feature (see early.ts) so the page paints with
// our layout from the first frame instead of flashing GitHub's own.
//
// The cached copy is read synchronously; the stored settings follow a moment
// later and win, which covers the first visit and any change made since.

import { loadSettings } from '../shared/settings';
import { applyEarly, cacheSettings, readCachedSettings } from './early';

const cached = readCachedSettings();
if (cached) applyEarly(cached, { predict: true });

loadSettings()
  .then((settings) => {
    cacheSettings(settings);
    applyEarly(settings, { predict: !cached });
  })
  .catch(() => {});
