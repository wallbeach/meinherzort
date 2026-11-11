// Serverseitiges Rendering der Druckdatei (300 dpi) aus swisstopo-WMTS-Kacheln.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import opentype from 'opentype.js';
import { TILE_SIZE, TILE_URL, PRINT_DPI, COLORS } from '../../public/shared/config.js';
import { viewport, projectInViewport } from '../../public/shared/geo.js';
import { layout, mmToPx, buildOverlaySvg } from '../../public/shared/poster.js';

sharp.cache(false);

// ---------- Schriften ----------
function findFile(rel) {
  const roots = [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    '/var/task',
  ].filter(Boolean);
  for (const r of roots) {
    const p = path.join(r, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Datei nicht gefunden: ${rel}`);
}

let fontCache;
export function loadFonts() {
  if (fontCache) return fontCache;
  const load = (name) => {
    const b = fs.readFileSync(findFile(`public/fonts/${name}`));
    return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  fontCache = {
    title: load('DMSerifDisplay_400Regular.ttf'),
    text: load('Inter_500Medium.ttf'),
    small: load('Inter_400Regular.ttf'),
  };
  return fontCache;
}

// ---------- Kacheln ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Holt eine Kachel. Gibt null zurück, wenn es keine gibt (ausserhalb der Schweiz). */
export async function fetchTileHttp(z, x, y) {
  const url = TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'meinherzort.ch Poster-Renderer (Kontakt: info@meinherzort.ch)' },
      });
      if (res.status === 404 || res.status === 400) return null;
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 429) await sleep(2000 * attempt);
      else await sleep(400 * attempt);
    } catch {
      await sleep(400 * attempt);
    }
  }
  throw new Error(`Kachel ${z}/${x}/${y} konnte nicht geladen werden`);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Rendert den Kartenausschnitt.
 * width/height: Darstellungspixel wie in der Vorschau (MAP_DPI)
 * outW/outH: Zielgrösse in Druckpixeln
 */
export async function renderMap({ center, zoom, width, height, outW, outH, fetchTile = fetchTileHttp, concurrency = 6 }) {
  const vp = viewport({ center, zoom, width, height });
  const n = Math.pow(2, vp.zt);
  const x0 = Math.floor(vp.left / TILE_SIZE);
  const y0 = Math.floor(vp.top / TILE_SIZE);
  const x1 = Math.floor((vp.right - 1e-6) / TILE_SIZE);
  const y1 = Math.floor((vp.bottom - 1e-6) / TILE_SIZE);
  const jobs = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (ty < 0 || ty >= n) continue;
      jobs.push({ tx, ty, wx: ((tx % n) + n) % n });
    }
  }
  const tiles = await mapLimit(jobs, concurrency, async (j) => ({
    ...j,
    buf: await fetchTile(vp.zt, j.wx, j.ty),
  }));
  const mosaicW = (x1 - x0 + 1) * TILE_SIZE;
  const mosaicH = (y1 - y0 + 1) * TILE_SIZE;
  const composites = [];
  for (const t of tiles) {
    if (!t.buf) continue;
    const img = await sharp(t.buf).resize(TILE_SIZE, TILE_SIZE, { fit: 'fill' }).removeAlpha().toBuffer();
    composites.push({ input: img, left: (t.tx - x0) * TILE_SIZE, top: (t.ty - y0) * TILE_SIZE });
  }
  const mosaic = await sharp({
    create: { width: mosaicW, height: mosaicH, channels: 3, background: '#ffffff' },
    limitInputPixels: false,
  })
    .composite(composites)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ex = Math.max(0, Math.round(vp.left - x0 * TILE_SIZE));
  const ey = Math.max(0, Math.round(vp.top - y0 * TILE_SIZE));
  const ew = Math.min(mosaicW - ex, Math.round(vp.right - vp.left));
  const eh = Math.min(mosaicH - ey, Math.round(vp.bottom - vp.top));
  const map = await sharp(mosaic.data, { raw: mosaic.info, limitInputPixels: false })
    .extract({ left: ex, top: ey, width: ew, height: eh })
    .resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 1 })
    .toBuffer();
  return { map, vp, tileCount: tiles.length, missingTiles: tiles.filter((t) => !t.buf).length };
}

/**
 * Rendert das ganze Poster.
 * Gibt { print (JPEG 300 dpi), preview (JPEG ~1000 px), meta } zurück.
 */
export async function renderPoster(design, { fetchTile = fetchTileHttp, dpi = PRINT_DPI, previewWidth = 1000 } = {}) {
  const L = layout(design.format);
  const W = Math.round(mmToPx(L.W, dpi));
  const H = Math.round(mmToPx(L.H, dpi));
  const mapX = Math.round(mmToPx(L.map.x, dpi));
  const mapY = Math.round(mmToPx(L.map.y, dpi));
  const mapW = Math.round(mmToPx(L.map.w, dpi));
  const mapH = Math.round(mmToPx(L.map.h, dpi));

  const { map, vp, tileCount, missingTiles } = await renderMap({
    center: design.center,
    zoom: design.zoom,
    width: L.mapPx.w,
    height: L.mapPx.h,
    outW: mapW,
    outH: mapH,
    fetchTile,
  });

  const heartMap = design.heart ? projectInViewport(vp, design.heart[0], design.heart[1]) : null;
  const svg = buildOverlaySvg({
    formatKey: design.format,
    design,
    fonts: loadFonts(),
    heartMap,
    pxWidth: W,
    pxHeight: H,
  });

  const composed = await sharp({
    create: { width: W, height: H, channels: 3, background: COLORS.paper },
    limitInputPixels: false,
  })
    .composite([
      { input: map, left: mapX, top: mapY },
      { input: Buffer.from(svg), left: 0, top: 0, limitInputPixels: false },
    ])
    .png({ compressionLevel: 1 })
    .toBuffer();

  const print = await sharp(composed, { limitInputPixels: false })
    .jpeg({ quality: 93, chromaSubsampling: '4:4:4', mozjpeg: false })
    .withMetadata({ density: dpi })
    .toBuffer();
  const preview = await sharp(composed, { limitInputPixels: false })
    .resize(previewWidth)
    .jpeg({ quality: 82 })
    .toBuffer();

  return {
    print,
    preview,
    meta: { widthPx: W, heightPx: H, dpi, tileZoom: vp.zt, tileCount, missingTiles },
  };
}
