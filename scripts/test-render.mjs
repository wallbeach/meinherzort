// Testet das Druck-Rendering ohne Netzwerk mit Ersatzkacheln.
// Aufruf: node scripts/test-render.mjs [format] [--real]
//   --real lädt echte swisstopo-Kacheln (nur wenn wmts.geo.admin.ch erreichbar ist)
import fs from 'node:fs';
import sharp from 'sharp';
import { renderPoster, fetchTileHttp } from '../netlify/lib/render.js';
import { validateDesign } from '../public/shared/validate.js';

const format = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '30x40-rahmen';
const real = process.argv.includes('--real');

async function mockTile(z, x, y) {
  const hue = (x * 37 + y * 17) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="hsl(${hue},35%,88%)"/>
    <path d="M0 128 H256 M128 0 V256" stroke="#7a9" stroke-width="2"/>
    <rect x="0.5" y="0.5" width="255" height="255" fill="none" stroke="#999"/>
    <text x="10" y="30" font-family="sans-serif" font-size="12" fill="#222">Ortsname ${z}/${x}/${y}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

const { ok, errors, design } = validateDesign({
  format,
  frame: 'natur',
  center: [7.8829, 47.5636],
  zoom: 14.3,
  heart: [7.8829, 47.5636],
  coordStyle: 'wgs',
  title: 'Wo alles begann',
  place: 'Wallbach AG',
  date: '14. Februar 2019',
});
if (!ok) throw new Error(errors.join(', '));

const t0 = Date.now();
const out = await renderPoster(design, { fetchTile: real ? fetchTileHttp : mockTile });
const ms = Date.now() - t0;
fs.mkdirSync('scripts/out', { recursive: true });
fs.writeFileSync(`scripts/out/${format}-print.jpg`, out.print);
fs.writeFileSync(`scripts/out/${format}-preview.jpg`, out.preview);
const rss = Math.round(process.memoryUsage().rss / 1e6);
console.log(JSON.stringify({ format, ms, rssMB: rss, printMB: +(out.print.length / 1e6).toFixed(1), ...out.meta }));
