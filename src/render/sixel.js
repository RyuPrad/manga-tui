import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { withTempImage } from './chafa.js';

const execFileAsync = promisify(execFile);

// Fallback cell pixel size when the terminal didn't report one.
const DEFAULT_CELL_W = 10;
const DEFAULT_CELL_H = 20;

// Encode an already-correctly-sized image to sixel at its NATIVE pixel
// resolution. --exact-size + font-ratio 1/1 makes chafa emit ~1 image px → 1
// sixel px, so the displayed size is exactly what we sized the image to — no
// dependence on chafa guessing the terminal's cell size through a pipe.
export async function encodePixels(buffer, { format = 'sixel' } = {}) {
  const { stdout } = await withTempImage(buffer, (file) =>
    execFileAsync(
      'chafa',
      ['--format', format, '--exact-size', 'on', '--font-ratio', '1/1', '--animate', 'off', file],
      { maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' },
    ),
  );
  return stdout; // Buffer of sixel/kitty bytes
}

// Resize/crop a page to the exact viewport pixel rectangle.
//   mode 'fit'   → whole page fits inside cols×rows cells
//   mode 'width' → full terminal width, vertical window at cell offset `scroll`
// Returns { buffer, maxScroll, scroll } (scroll clamped to range).
export async function prepareImage(buffer, { mode, cols, rows, scroll = 0, cellW, cellH }) {
  const cw = cellW || DEFAULT_CELL_W;
  const ch = cellH || DEFAULT_CELL_H;
  const viewW = Math.max(1, Math.round(cols * cw));
  const viewH = Math.max(1, Math.round(rows * ch));

  if (mode === 'fit') {
    const buffer2 = await sharp(buffer)
      .resize({ width: viewW, height: viewH, fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
    return { buffer: buffer2, maxScroll: 0, scroll: 0 };
  }

  // mode 'width': scale to full width, then extract a vertical window.
  const widthScaled = await sharp(buffer).resize({ width: viewW }).png().toBuffer();
  const meta = await sharp(widthScaled).metadata();
  const scaledH = meta.height || viewH;

  const maxScrollPx = Math.max(0, scaledH - viewH);
  const maxScroll = Math.ceil(maxScrollPx / ch);
  const clamped = Math.max(0, Math.min(scroll, maxScroll));
  const top = Math.min(maxScrollPx, clamped * ch);
  const cropH = Math.max(1, Math.min(viewH, scaledH - top));

  const buffer2 = await sharp(widthScaled)
    .extract({ left: 0, top: Math.round(top), width: viewW, height: Math.round(cropH) })
    .png()
    .toBuffer();
  return { buffer: buffer2, maxScroll, scroll: clamped };
}
