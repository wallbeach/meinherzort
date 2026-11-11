// Generator: Suche, Karte, Herz, Texte, Live-Vorschau, Freigabe, Checkout.
import {
  FORMATS, DEFAULT_FORMAT, TILE_URL, MAX_TILE_ZOOM, MIN_MAP_ZOOM, MAX_MAP_ZOOM, MAX_BOUNDS, CREDIT,
} from './shared/config.js';
import { layout, buildOverlaySvg, cleanText, subtitleLine } from './shared/poster.js';
import { validateDesign } from './shared/validate.js';
import { parse as parseFont } from './vendor/opentype.min.mjs';

const $ = (id) => document.getElementById(id);
const FRAME_COLORS = { natur: '#c9a77c', schwarz: '#1d1d1d', weiss: '#f4f2ee' };
const STORAGE_KEY = 'meinherzort.design.v1';

const state = {
  format: DEFAULT_FORMAT,
  frame: FORMATS[DEFAULT_FORMAT].defaultFrame,
  heart: [8.2275, 46.8182], // Mitte der Schweiz, bis gesucht wird
  coordStyle: 'wgs',
  placeDirty: false,
};
let map, fonts, L, scale = 1;

// ---------- Hilfen ----------
const store = {
  load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } },
  save(v) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* egal */ } },
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
let rafPending = false;
const scheduleOverlay = () => {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; drawOverlay(); });
};

function texts() {
  return cleanText({ title: $('title').value, place: $('place').value, date: $('date').value });
}

function currentDesign() {
  const c = map.getCenter();
  return {
    format: state.format,
    frame: FORMATS[state.format].frames ? state.frame : null,
    center: [round6(c.lng), round6(c.lat)],
    zoom: Math.round(map.getZoom() * 1000) / 1000,
    heart: state.heart.map(round6),
    coordStyle: state.coordStyle,
    ...texts(),
  };
}
const round6 = (n) => Math.round(n * 1e6) / 1e6;

// ---------- Layout / Format ----------
function applyLayout(keepExtent = true) {
  const prevW = L?.mapPx.w;
  L = layout(state.format);
  const poster = $('poster');
  poster.style.aspectRatio = `${L.W} / ${L.H}`;
  const pct = (v, total) => `${(v / total) * 100}%`;
  for (const id of ['mapbox', 'gesture']) {
    const el = $(id);
    el.style.left = pct(L.map.x, L.W);
    el.style.top = pct(L.map.y, L.H);
    el.style.width = pct(L.map.w, L.W);
    el.style.height = pct(L.map.h, L.H);
  }
  const m = $('map');
  m.style.width = `${L.mapPx.w}px`;
  m.style.height = `${L.mapPx.h}px`;
  const f = FORMATS[state.format];
  poster.style.setProperty('--frame', f.frames ? FRAME_COLORS[state.frame] : 'transparent');
  if (map) {
    const z = map.getZoom();
    map.resize();
    // gleicher geografischer Ausschnitt beim Formatwechsel
    if (keepExtent && prevW && prevW !== L.mapPx.w) map.setZoom(clampZoom(z + Math.log2(L.mapPx.w / prevW)));
  }
  fitScale();
}

function fitScale() {
  const box = $('mapbox');
  const w = box.clientWidth;
  if (!w || !L) return;
  scale = w / L.mapPx.w;
  $('map').style.transform = `scale(${scale})`;
  if (map) {
    const pr = Math.min(2, Math.max(0.35, scale * (window.devicePixelRatio || 1) * 1.15));
    if (Math.abs(map.getPixelRatio() - pr) > 0.05) map.setPixelRatio(pr);
  }
  scheduleOverlay();
}

const clampZoom = (z) => Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, z));

// ---------- Overlay (gleiche Funktion wie im Druck) ----------
function drawOverlay() {
  if (!fonts || !map || !L) return;
  const design = currentDesign();
  const p = map.project(state.heart);
  const svg = buildOverlaySvg({ formatKey: state.format, design, fonts, heartMap: { x: p.x, y: p.y } });
  $('overlay').innerHTML = svg;
  renderProof(design);
}

function renderProof(d) {
  const f = FORMATS[d.format];
  const rows = [
    ['Titel', d.title],
    ['Zeile', subtitleLine(d)],
    ['Format', f.label + (f.frames ? `, Rahmen ${f.frames[d.frame]}` : '')],
    ['Preis', `CHF ${f.priceChf}.– inkl. Versand`],
  ];
  $('proof').innerHTML = '<dl>' + rows.map(([k, v]) =>
    `<dt>${k}</dt><dd class="${v ? '' : 'empty'}">${v ? escapeHtml(v) : 'leer'}</dd>`).join('') + '</dl>';
  $('buy').textContent = `Zur Kasse · CHF ${f.priceChf}.–`;
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Jede Änderung hebt die Freigabe auf
function changed() {
  if ($('approved').checked) {
    $('approved').checked = false;
    updateBuy();
  }
  persist();
  scheduleOverlay();
}
const persist = debounce(() => {
  if (!map) return;
  store.save({ ...currentDesign(), placeDirty: state.placeDirty });
}, 400);

function updateBuy() {
  $('buy').disabled = !$('approved').checked;
}

// ---------- Format-Auswahl ----------
function buildFormatControls() {
  const box = $('formats');
  box.innerHTML = Object.entries(FORMATS).map(([k, f]) => `
    <label class="opt ${k === state.format ? 'on' : ''}">
      <input type="radio" name="format" value="${k}" ${k === state.format ? 'checked' : ''}>
      <span><b>${f.label}</b></span><span class="price">CHF ${f.priceChf}.–</span>
    </label>`).join('');
  box.onchange = (e) => {
    state.format = e.target.value;
    if (FORMATS[state.format].frames && !state.frame) state.frame = FORMATS[state.format].defaultFrame;
    buildFormatControls();
    applyLayout(true);
    changed();
  };
  const f = FORMATS[state.format];
  const frames = $('frames');
  if (!f.frames) { frames.innerHTML = ''; return; }
  frames.innerHTML = Object.entries(f.frames).map(([k, label]) => `
    <label class="chip ${k === state.frame ? 'on' : ''}">
      <input type="radio" name="frame" value="${k}" ${k === state.frame ? 'checked' : ''}>
      <i style="background:${FRAME_COLORS[k]}"></i>${label}
    </label>`).join('');
  frames.onchange = (e) => {
    state.frame = e.target.value;
    buildFormatControls();
    applyLayout(false);
    changed();
  };
}

// ---------- Karte ----------
function initMap(saved) {
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        lk: {
          type: 'raster',
          tiles: [TILE_URL],
          tileSize: 256,
          maxzoom: MAX_TILE_ZOOM,
          attribution: CREDIT,
        },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#ffffff' } },
        { id: 'lk', type: 'raster', source: 'lk', paint: { 'raster-fade-duration': 0 } },
      ],
    },
    center: saved?.center || [8.2275, 46.8182],
    zoom: saved?.zoom || 8,
    minZoom: MIN_MAP_ZOOM,
    maxZoom: MAX_MAP_ZOOM,
    maxBounds: [[MAX_BOUNDS[0][0] - 1, MAX_BOUNDS[0][1] - 0.6], [MAX_BOUNDS[1][0] + 1, MAX_BOUNDS[1][1] + 0.6]],
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    pixelRatio: 1,
    renderWorldCopies: false,
  });
  map.on('move', scheduleOverlay);
  map.on('moveend', changed);
  map.on('idle', () => { $('loading').hidden = true; });
  map.on('error', (e) => console.warn('Kartenfehler', e?.error?.message));
}

// Eigene Gesten, weil die Karte für die exakte Druckvorschau skaliert dargestellt wird
function initGestures() {
  const g = $('gesture');
  const pts = new Map();
  let start = null, lastPinch = null, moved = 0;

  const local = (e) => {
    const r = g.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  g.addEventListener('pointerdown', (e) => {
    g.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) { start = { ...local(e), t: Date.now() }; moved = 0; }
    lastPinch = null;
  });
  g.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    const cur = local(e);
    pts.set(e.pointerId, cur);
    if (pts.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      map.panBy([-dx / scale, -dy / scale], { duration: 0 });
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (lastPinch) {
        const around = map.unproject([mid.x / scale, mid.y / scale]);
        map.panBy([(lastPinch.mid.x - mid.x) / scale, (lastPinch.mid.y - mid.y) / scale], { duration: 0 });
        map.zoomTo(clampZoom(map.getZoom() + Math.log2(dist / lastPinch.dist)), { around, duration: 0 });
      }
      lastPinch = { dist, mid };
      moved += 100;
    }
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.delete(e.pointerId);
    lastPinch = null;
    if (pts.size === 0 && start && moved < 8 && Date.now() - start.t < 600) {
      const ll = map.unproject([p.x / scale, p.y / scale]);
      state.heart = [ll.lng, ll.lat];
      changed();
    }
    if (pts.size === 0) start = null;
  };
  g.addEventListener('pointerup', end);
  g.addEventListener('pointercancel', end);
  g.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    const around = map.unproject([p.x / scale, p.y / scale]);
    map.zoomTo(clampZoom(map.getZoom() - e.deltaY * 0.0025), { around, duration: 0 });
    debouncedChanged();
  }, { passive: false });
  const debouncedChanged = debounce(changed, 300);

  $('zoomIn').onclick = () => map.easeTo({ zoom: clampZoom(map.getZoom() + 0.5), duration: 200 });
  $('zoomOut').onclick = () => map.easeTo({ zoom: clampZoom(map.getZoom() - 0.5), duration: 200 });
  $('centerHeart').onclick = () => map.easeTo({ center: state.heart, duration: 300 });
}

// ---------- Suche (swisstopo SearchServer) ----------
const ZOOM_BY_ORIGIN = { address: 15.6, parcel: 15.6, gazetteer: 14.2, zipcode: 13, gg25: 13, district: 10.5, kantone: 9 };

function initSearch() {
  const input = $('search');
  const list = $('results');
  let items = [];
  let ctrl;

  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { list.hidden = true; return; }
    ctrl?.abort();
    ctrl = new AbortController();
    try {
      const url = `https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&limit=8&sr=4326&lang=de&searchText=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: ctrl.signal });
      const data = await res.json();
      items = (data.results || []).map((r) => ({
        label: (r.attrs.label || '').replace(/<[^>]+>/g, ''),
        origin: r.attrs.origin,
        lat: r.attrs.lat,
        lon: r.attrs.lon,
      })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
      list.innerHTML = items.map((r, i) =>
        `<li role="option" data-i="${i}">${escapeHtml(r.label)}<small>${originLabel(r.origin)}</small></li>`).join('')
        || '<li>Nichts gefunden</li>';
      list.hidden = false;
    } catch (e) {
      if (e.name !== 'AbortError') { list.innerHTML = '<li>Suche gerade nicht erreichbar</li>'; list.hidden = false; }
    }
  }, 250);

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (items[0]) pick(items[0]); }
    if (e.key === 'Escape') list.hidden = true;
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) pick(items[Number(li.dataset.i)]);
  });

  function pick(r) {
    list.hidden = true;
    input.value = r.label;
    input.blur();
    state.heart = [r.lon, r.lat];
    map.jumpTo({ center: [r.lon, r.lat], zoom: ZOOM_BY_ORIGIN[r.origin] ?? 14 });
    if (!state.placeDirty) $('place').value = placeFromLabel(r);
    changed();
    if (window.innerWidth < 900) $('posterWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function originLabel(o) {
  return { address: 'Adresse', gazetteer: 'Ort, Berg, Flurname', gg25: 'Gemeinde', zipcode: 'PLZ', district: 'Bezirk', kantone: 'Kanton', parcel: 'Parzelle' }[o] || '';
}

// "Rheinstrasse 71 4323 Wallbach" -> "Wallbach"; "Wallbach (AG)" -> "Wallbach AG"
function placeFromLabel(r) {
  let s = r.label.replace(/\s*\((\w{2})\)\s*$/, ' $1').trim();
  if (r.origin === 'address') {
    const m = s.match(/\b\d{4}\s+(.+)$/);
    if (m) s = m[1];
  }
  if (r.origin === 'zipcode') s = s.replace(/^\d{4}\s*-?\s*/, '');
  return s.slice(0, 40);
}

// ---------- Checkout ----------
function initForm() {
  for (const id of ['title', 'date']) $(id).addEventListener('input', changed);
  $('place').addEventListener('input', () => { state.placeDirty = true; changed(); });
  document.querySelectorAll('input[name=coordStyle]').forEach((el) =>
    el.addEventListener('change', () => { state.coordStyle = el.value; changed(); }));
  $('approved').addEventListener('change', updateBuy);

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('error');
    err.hidden = true;
    const { ok, errors, design } = validateDesign(currentDesign());
    if (!ok) { err.textContent = errors.join(' '); err.hidden = false; return; }
    const btn = $('buy');
    btn.disabled = true;
    btn.textContent = 'Einen Moment …';
    try {
      const params = new URLSearchParams(location.search);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: true, design, source: params.get('ref') || params.get('utm_source') || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || 'Die Kasse ist gerade nicht erreichbar.');
      location.href = data.url;
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      renderProof(currentDesign());
    }
  });
}

// ---------- Start ----------
async function loadFonts() {
  const get = async (f) => parseFont(await (await fetch(`/fonts/${f}`)).arrayBuffer());
  const [title, text, small] = await Promise.all([
    get('DMSerifDisplay_400Regular.ttf'), get('Inter_500Medium.ttf'), get('Inter_400Regular.ttf'),
  ]);
  return { title, text, small };
}

async function start() {
  const saved = store.load();
  if (saved) {
    if (FORMATS[saved.format]) state.format = saved.format;
    if (saved.frame) state.frame = saved.frame;
    if (Array.isArray(saved.heart)) state.heart = saved.heart;
    state.coordStyle = saved.coordStyle === 'lv95' ? 'lv95' : 'wgs';
    state.placeDirty = !!saved.placeDirty;
    if (saved.title) $('title').value = saved.title;
    if (saved.place) $('place').value = saved.place;
    if (saved.date) $('date').value = saved.date;
    const r = document.querySelector(`input[name=coordStyle][value=${state.coordStyle}]`);
    if (r) r.checked = true;
  }
  buildFormatControls();
  applyLayout(false);
  initMap(saved);
  initGestures();
  initSearch();
  initForm();
  new ResizeObserver(fitScale).observe($('mapbox'));
  fonts = await loadFonts();
  fitScale();
  drawOverlay();
  if (new URLSearchParams(location.search).has('abgebrochen')) {
    $('error').textContent = 'Die Zahlung wurde abgebrochen. Dein Entwurf ist noch da.';
    $('error').hidden = false;
  }
}

if (window.maplibregl) start();
else window.addEventListener('load', start);
