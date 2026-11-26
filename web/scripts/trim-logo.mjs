// Builds the rail's trimmed wordmark from the official logo, no redraw and no new dependency: the official
// logo-red-on-white-compact.png (1600x200) carries ~22% transparent padding on each side, so at the rail's height the
// letters came out ~14px tall and off centre. This crops the transparent padding only (alpha > 8) and scales the
// crop to 26px high at 1x and 2x, using Chromium's canvas through the Playwright that is already a dev dependency.
//   node scripts/trim-logo.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = resolve(
  root,
  'skills/sharkx-brand-guidelines/assets/logos/logo-red-on-white-compact.png',
);
const outDir = resolve(root, 'web/public/brand');
const HEIGHT = 26;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ({ b64, height }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const full = document.createElement('canvas');
      full.width = img.naturalWidth;
      full.height = img.naturalHeight;
      const fx = full.getContext('2d', { willReadFrequently: true });
      fx.drawImage(img, 0, 0);
      const { data, width, height: h } = fx.getImageData(0, 0, full.width, full.height);
      let [x0, y0, x1, y1] = [width, h, -1, -1];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 8) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        }
      }
      const cw = x1 - x0 + 1;
      const ch = y1 - y0 + 1;
      const out = {};
      for (const scale of [1, 2]) {
        const outH = height * scale;
        const outW = Math.round((cw * outH) / ch);
        // Halve in steps so the downscale stays sharp, then the last step lands on the exact size.
        let cur = document.createElement('canvas');
        cur.width = cw;
        cur.height = ch;
        cur.getContext('2d').drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
        while (cur.height / 2 > outH) {
          const next = document.createElement('canvas');
          next.width = Math.round(cur.width / 2);
          next.height = Math.round(cur.height / 2);
          const nx = next.getContext('2d');
          nx.imageSmoothingQuality = 'high';
          nx.drawImage(cur, 0, 0, next.width, next.height);
          cur = next;
        }
        const last = document.createElement('canvas');
        last.width = outW;
        last.height = outH;
        const lx = last.getContext('2d');
        lx.imageSmoothingQuality = 'high';
        lx.drawImage(cur, 0, 0, outW, outH);
        out[scale] = { w: outW, h: outH, url: last.toDataURL('image/png') };
      }
      return { box: { x0, y0, cw, ch, width, h }, out };
    },
    { b64: readFileSync(source).toString('base64'), height: HEIGHT },
  );

  mkdirSync(outDir, { recursive: true });
  const names = { 1: 'logo-red-wordmark-trim.png', 2: 'logo-red-wordmark-trim-2x.png' };
  for (const scale of [1, 2]) {
    const { w, h, url } = result.out[scale];
    writeFileSync(resolve(outDir, names[scale]), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`${names[scale]}  ${w}x${h}`);
  }
  console.log('crop', result.box);
} finally {
  await browser.close();
}
