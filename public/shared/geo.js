// Geometrie: Web-Mercator, Kachelmathematik, Schweizer Koordinaten (LV95).
import { TILE_SIZE, MAX_TILE_ZOOM } from './config.js';

const RAD = Math.PI / 180;

/** Längen/Breite -> normierte Weltkoordinaten (0..1). */
export function lonLatToWorld(lon, lat) {
  const x = (lon + 180) / 360;
  const s = Math.sin(lat * RAD);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return { x, y };
}

export function worldToLonLat(x, y) {
  const lon = x * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = Math.atan(Math.sinh(n)) / RAD;
  return { lon, lat };
}

/**
 * Bildet das Verhalten von MapLibre nach: Bei Kartenzoom Z (512-px-Welt) nutzt eine
 * 256-px-Rasterquelle Kacheln der Stufe round(Z+1). Ein Kachelpixel wird mit
 * dem Faktor s = 2^(Z+1-zt) dargestellt.
 *
 * Gibt den sichtbaren Ausschnitt in Kachelpixeln (Stufe zt) zurück für eine Karte
 * mit width x height Darstellungspixeln.
 */
export function viewport({ center, zoom, width, height }) {
  const zt = Math.max(0, Math.min(MAX_TILE_ZOOM, Math.round(zoom + 1)));
  const s = Math.pow(2, zoom + 1 - zt);
  const world = TILE_SIZE * Math.pow(2, zt);
  const c = lonLatToWorld(center[0], center[1]);
  const cx = c.x * world;
  const cy = c.y * world;
  const hw = width / 2 / s;
  const hh = height / 2 / s;
  return {
    zt,
    s,
    world,
    left: cx - hw,
    top: cy - hh,
    right: cx + hw,
    bottom: cy + hh,
  };
}

/** Projiziert einen Punkt in Darstellungspixel der Karte (0,0 = oben links). */
export function projectInViewport(vp, lon, lat) {
  const p = lonLatToWorld(lon, lat);
  return {
    x: (p.x * vp.world - vp.left) * vp.s,
    y: (p.y * vp.world - vp.top) * vp.s,
  };
}

/** WGS84 -> LV95 (Näherungsformel swisstopo, Genauigkeit ~1 m). */
export function wgs84ToLv95(lon, lat) {
  const phi = (lat * 3600 - 169028.66) / 10000;
  const lam = (lon * 3600 - 26782.5) / 10000;
  const E =
    2600072.37 +
    211455.93 * lam -
    10938.51 * lam * phi -
    0.36 * lam * phi * phi -
    44.54 * lam ** 3;
  const N =
    1200147.07 +
    308807.95 * phi +
    3745.25 * lam * lam +
    76.63 * phi * phi -
    194.56 * lam * lam * phi +
    119.79 * phi ** 3;
  return { E, N };
}

function swissThousands(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '’');
}

function dms(value, pos, neg) {
  const hemi = value >= 0 ? pos : neg;
  const v = Math.abs(value);
  let d = Math.floor(v);
  let m = Math.floor((v - d) * 60);
  let s = Math.round(((v - d) * 60 - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  return `${d}° ${String(m).padStart(2, '0')}′ ${String(s).padStart(2, '0')}″ ${hemi}`;
}

/** Koordinatenzeile fürs Poster. style: 'wgs' | 'lv95' */
export function formatCoords(lon, lat, style = 'wgs') {
  if (style === 'lv95') {
    const { E, N } = wgs84ToLv95(lon, lat);
    return `${swissThousands(E)} / ${swissThousands(N)}`;
  }
  return `${dms(lat, 'N', 'S')} · ${dms(lon, 'E', 'W')}`;
}
