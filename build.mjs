import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  jsx: 'automatic',
  logLevel: 'info',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
};

const builds = [
  { entryPoints: ['src/popup/popup.tsx'], outfile: `${outdir}/popup.js` },
  { entryPoints: ['src/content/content.ts'], outfile: `${outdir}/content.js` },
  { entryPoints: ['src/content/content.css'], outfile: `${outdir}/content.css` },
];

async function copyStatic() {
  await cp('src/popup/popup.html', `${outdir}/popup.html`);
  await cp('manifest.json', `${outdir}/manifest.json`);
  await cp('src/icons', `${outdir}/icons`, { recursive: true });
}

if (watch) {
  const ctxs = await Promise.all(builds.map((b) => esbuild.context({ ...shared, ...b })));
  await copyStatic();
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('esbuild is watching for changes…');
} else {
  await Promise.all(builds.map((b) => esbuild.build({ ...shared, ...b })));
  await copyStatic();
  console.log(`build complete → ${outdir}/`);
}
