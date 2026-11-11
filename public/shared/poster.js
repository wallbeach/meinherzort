// Poster-Layout und Text-/Herz-Overlay als SVG (in Millimetern).
// Dieselbe Funktion erzeugt die Vorschau im Browser und das Overlay der Druckdatei.
import { FORMATS, MAP_DPI, COLORS, CREDIT, LIMITS } from './config.js';
import { formatCoords } from './geo.js';

const MM_PER_INCH = 25.4;

/** Layout in mm für ein Format. */
export function layout(formatKey) {
  const f = FORMATS[formatKey];
  if (!f) throw new Error(`Unbekanntes Format: ${formatKey}`);
  const W = f.widthMm;
  const H = f.heightMm;
  const m = W * 0.07;
  const map = { x: m, y: m, w: W - 2 * m, h: H * 0.735 - m };
  return {
    W,
    H,
    margin: m,
    map,
    // Kartengrösse in Darstellungspixeln (MAP_DPI). Browser und Server runden gleich.
    mapPx: {
      w: Math.round((map.w / MM_PER_INCH) * MAP_DPI),
      h: Math.round((map.h / MM_PER_INCH) * MAP_DPI),
    },
    title: { y: H * 0.835, size: W * 0.072, maxWidth: W * 0.86 },
    subtitle: { y: H * 0.882, size: W * 0.026, spacing: 0.14, maxWidth: W * 0.86 },
    coords: { y: H * 0.92, size: W * 0.021, spacing: 0.04, maxWidth: W * 0.86 },
    credit: { x: W - m, y: map.y + map.h + W * 0.02, size: W * 0.012 },
    heart: { size: W * 0.045 },
    borderWidth: Math.max(0.35, W * 0.0015),
  };
}

export function mmToPx(mm, dpi) {
  return (mm / MM_PER_INCH) * dpi;
}

/** Bereinigt und begrenzt die Kundentexte (Browser und Server). */
export function cleanText(design) {
  const clip = (s, n) =>
    String(s ?? '')
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, n);
  return {
    title: clip(design.title, LIMITS.title),
    place: clip(design.place, LIMITS.place),
    date: clip(design.date, LIMITS.date),
  };
}

export function subtitleLine({ place, date }) {
  return [place, date].filter(Boolean).join('  ·  ').toLocaleUpperCase('de-CH');
}

// ---------- Textsatz ohne OpenType-Shaping (robust für Browser und Node) ----------

function layoutGlyphs(font, text, size, letterSpacingEm = 0) {
  const scale = size / font.unitsPerEm;
  const glyphs = [];
  let x = 0;
  for (const ch of Array.from(text)) {
    const g = font.charToGlyph(ch);
    glyphs.push({ g, x });
    x += (g.advanceWidth || 0) * scale + letterSpacingEm * size;
  }
  if (glyphs.length) x -= letterSpacingEm * size; // kein Abstand nach dem letzten Zeichen
  return { glyphs, width: x };
}

/** Zentrierter Text als SVG-Pfad. Verkleinert die Schrift, falls zu breit. */
function centeredTextPath(font, text, { cx, y, size, spacing = 0, maxWidth }) {
  if (!text) return { d: '', size };
  let s = size;
  let lay = layoutGlyphs(font, text, s, spacing);
  if (maxWidth && lay.width > maxWidth) {
    s = (s * maxWidth) / lay.width;
    lay = layoutGlyphs(font, text, s, spacing);
  }
  const x0 = cx - lay.width / 2;
  let d = '';
  for (const { g, x } of lay.glyphs) {
    d += g.getPath(x0 + x, y, s).toPathData(3);
  }
  return { d, size: s };
}

function rightTextPath(font, text, { x, y, size }) {
  const lay = layoutGlyphs(font, text, size, 0.02);
  const x0 = x - lay.width;
  let d = '';
  for (const g of lay.glyphs) d += g.g.getPath(x0 + g.x, y, size).toPathData(3);
  return d;
}

// Herz (Material Icons "favorite", Apache 2.0), Viewbox 24x24, Mittelpunkt ~ (12, 12.2)
const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

/**
 * Baut das Overlay-SVG (Rahmenlinie, Herz, Texte, Quellenangabe).
 * @param fonts { title, text, small } opentype.js-Fonts
 * @param heartMap Herzposition in Darstellungspixeln der Karte (MAP_DPI) oder null
 * @param opts.pxWidth/pxHeight optionale Pixelgrösse des SVG (für den Server)
 * @param opts.paper Papierhintergrund mitzeichnen (Vorschau-Thumbnail)
 */
export function buildOverlaySvg({ formatKey, design, fonts, heartMap, pxWidth, pxHeight, paper = false }) {
  const L = layout(formatKey);
  const t = cleanText(design);
  const cx = L.W / 2;

  const title = centeredTextPath(fonts.title, t.title, { cx, ...L.title });
  const sub = centeredTextPath(fonts.text, subtitleLine(t), { cx, ...L.subtitle });
  const coordText = design.heart
    ? formatCoords(design.heart[0], design.heart[1], design.coordStyle)
    : '';
  const coords = centeredTextPath(fonts.text, coordText, { cx, ...L.coords });
  const credit = rightTextPath(fonts.small, CREDIT, L.credit);

  let heart = '';
  if (heartMap) {
    const mmPerPx = L.map.w / L.mapPx.w;
    const hx = L.map.x + heartMap.x * mmPerPx;
    const hy = L.map.y + heartMap.y * mmPerPx;
    const inside =
      hx >= L.map.x && hx <= L.map.x + L.map.w && hy >= L.map.y && hy <= L.map.y + L.map.h;
    if (inside) {
      const k = L.heart.size / 24;
      // Herzmitte (12, 12.2) auf den Punkt legen
      heart = `<g transform="translate(${(hx - 12 * k).toFixed(3)} ${(hy - 12.2 * k).toFixed(3)}) scale(${k.toFixed(5)})"><path d="${HEART_PATH}" fill="${COLORS.heart}" stroke="${COLORS.heartStroke}" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"/></g>`;
    }
  }

  const size = pxWidth ? ` width="${pxWidth}" height="${pxHeight}"` : '';
  const bw = L.borderWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.W} ${L.H}"${size}>` +
    (paper ? `<rect width="${L.W}" height="${L.H}" fill="${COLORS.paper}"/>` : '') +
    `<clipPath id="mc"><rect x="${L.map.x}" y="${L.map.y}" width="${L.map.w}" height="${L.map.h}"/></clipPath>` +
    `<g clip-path="url(#mc)">${heart}</g>` +
    `<rect x="${L.map.x - bw / 2}" y="${L.map.y - bw / 2}" width="${L.map.w + bw}" height="${L.map.h + bw}" fill="none" stroke="${COLORS.border}" stroke-width="${bw}"/>` +
    `<path d="${title.d}" fill="${COLORS.ink}"/>` +
    `<path d="${sub.d}" fill="${COLORS.ink}"/>` +
    `<path d="${coords.d}" fill="${COLORS.muted}"/>` +
    `<path d="${credit}" fill="${COLORS.muted}"/>` +
    `</svg>`;
}
