// Schnelle Tests (laufen bei jedem Netlify-Build: npm test)
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { wgs84ToLv95, formatCoords, viewport, projectInViewport, lonLatToWorld, worldToLonLat } from '../public/shared/geo.js';
import { validateDesign } from '../public/shared/validate.js';
import { layout, buildOverlaySvg } from '../public/shared/poster.js';
import { renderPoster, loadFonts } from '../netlify/lib/render.js';
import { buildOrderPayload } from '../netlify/lib/gelato.js';

const base = {
  format: '30x40-rahmen', frame: 'natur', center: [7.8829, 47.5636], zoom: 14.3,
  heart: [7.8829, 47.5636], coordStyle: 'wgs', title: 'Wo alles begann', place: 'Wallbach AG', date: '14.02.2019',
};

test('LV95-Umrechnung (Referenzpunkt Bern, swisstopo)', () => {
  // Alte Sternwarte Bern ~ 2'600'000 / 1'200'000
  const { E, N } = wgs84ToLv95(7.43863, 46.95108);
  assert.ok(Math.abs(E - 2600000) < 5, `E=${E}`);
  assert.ok(Math.abs(N - 1200000) < 5, `N=${N}`);
  assert.match(formatCoords(7.43863, 46.95108, 'lv95'), /^2’600’00\d \/ 1’20000\d|^2’6\d\d’\d{3} \/ 1’2\d\d’\d{3}$/);
});

test('Mercator hin und zurück', () => {
  const w = lonLatToWorld(8.5, 47.3);
  const b = worldToLonLat(w.x, w.y);
  assert.ok(Math.abs(b.lon - 8.5) < 1e-9 && Math.abs(b.lat - 47.3) < 1e-9);
});

test('Viewport: Mittelpunkt liegt in der Kartenmitte', () => {
  const vp = viewport({ center: [8, 47], zoom: 13.4, width: 1500, height: 1600 });
  const p = projectInViewport(vp, 8, 47);
  assert.ok(Math.abs(p.x - 750) < 1e-6 && Math.abs(p.y - 800) < 1e-6);
  assert.equal(vp.zt, 14); // round(13.4 + 1)
});

test('Validierung', () => {
  assert.equal(validateDesign(base).ok, true);
  assert.equal(validateDesign({ ...base, heart: [2.35, 48.85] }).ok, false); // Paris
  assert.equal(validateDesign({ ...base, title: '   ' }).ok, false);
  assert.equal(validateDesign({ ...base, frame: 'gold' }).ok, false);
  const v = validateDesign({ ...base, title: '<b>Hallo</b>' + 'x'.repeat(80) });
  assert.ok(!v.design.title.includes('<') && v.design.title.length <= 32);
});

test('Overlay-SVG enthält Herz und Texte, langer Titel wird verkleinert', () => {
  const fonts = loadFonts();
  const L = layout('30x40-rahmen');
  const svg = buildOverlaySvg({ formatKey: base.format, design: base, fonts, heartMap: { x: L.mapPx.w / 2, y: L.mapPx.h / 2 } });
  assert.match(svg, /<svg[^>]+viewBox="0 0 300 400"/);
  assert.match(svg, /translate\(/); // Herz
  const outside = buildOverlaySvg({ formatKey: base.format, design: base, fonts, heartMap: { x: -50, y: 10 } });
  assert.doesNotMatch(outside, /translate\(/); // Herz ausserhalb -> nicht gezeichnet
});

test('Rendering mit Ersatzkacheln (72 dpi, schnell)', async () => {
  const tile = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#dde8d8' } }).jpeg().toBuffer();
  let calls = 0;
  const out = await renderPoster(validateDesign(base).design, {
    dpi: 72,
    fetchTile: async () => { calls++; return tile; },
  });
  const meta = await sharp(out.print).metadata();
  assert.equal(meta.width, Math.round((300 / 25.4) * 72));
  assert.ok(calls > 0);
});

test('Gelato-Payload', () => {
  process.env.GELATO_PRODUCT_UIDS = JSON.stringify({ '30x40-rahmen:natur': 'uid-natur' });
  const p = buildOrderPayload({
    id: 'HZ-1', email: 'a@b.ch', phone: '', design: validateDesign(base).design,
    shipping: { name: 'Anna Maria Muster', address: { line1: 'Weg 1', city: 'Wallbach', postal_code: '4323', country: 'CH' } },
  }, 'https://x/y.jpg');
  assert.equal(p.orderType, 'draft');
  assert.equal(p.items[0].productUid, 'uid-natur');
  assert.equal(p.shippingAddress.firstName, 'Anna Maria');
  assert.equal(p.shippingAddress.lastName, 'Muster');
});
