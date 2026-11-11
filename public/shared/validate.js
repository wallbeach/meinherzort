// Prüft ein Design vor Checkout (Server) und vor dem Absenden (Browser).
import { FORMATS, MAX_BOUNDS, MIN_MAP_ZOOM, MAX_MAP_ZOOM } from './config.js';
import { cleanText } from './poster.js';

const inBounds = ([lon, lat]) =>
  Number.isFinite(lon) &&
  Number.isFinite(lat) &&
  lon >= MAX_BOUNDS[0][0] &&
  lon <= MAX_BOUNDS[1][0] &&
  lat >= MAX_BOUNDS[0][1] &&
  lat <= MAX_BOUNDS[1][1];

export function validateDesign(input) {
  const errors = [];
  const d = input || {};
  const format = FORMATS[d.format];
  if (!format) errors.push('Format fehlt.');
  let frame = null;
  if (format?.frames) {
    frame = d.frame in format.frames ? d.frame : null;
    if (!frame) errors.push('Rahmenfarbe fehlt.');
  }
  const center = Array.isArray(d.center) ? d.center.map(Number) : null;
  const heart = Array.isArray(d.heart) ? d.heart.map(Number) : null;
  const zoom = Number(d.zoom);
  if (!center || !inBounds(center)) errors.push('Kartenausschnitt liegt ausserhalb der Schweiz.');
  if (!heart || !inBounds(heart)) errors.push('Bitte setze das Herz auf der Karte.');
  if (!Number.isFinite(zoom) || zoom < MIN_MAP_ZOOM || zoom > MAX_MAP_ZOOM + 0.001)
    errors.push('Zoomstufe ungültig.');
  const text = cleanText(d);
  if (!text.title) errors.push('Bitte gib einen Titel ein.');
  const coordStyle = d.coordStyle === 'lv95' ? 'lv95' : 'wgs';
  return {
    ok: errors.length === 0,
    errors,
    design: {
      format: d.format,
      frame,
      center,
      zoom: Math.round(zoom * 1000) / 1000,
      heart,
      coordStyle,
      ...text,
    },
  };
}
