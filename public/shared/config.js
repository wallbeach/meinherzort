// Gemeinsame Konfiguration für Browser (Vorschau) und Server (Druck).
// Änderungen hier wirken auf beide Seiten gleich.

export const BRAND = {
  name: 'meinherzort',
  domain: 'meinherzort.ch',
  collection: 'Wo alles begann',
};

// Druckformate. Preise in CHF inkl. Versand und MWST.
// Die Gelato-Produkt-IDs stehen NICHT hier, sondern in der Umgebungsvariable
// GELATO_PRODUCT_UIDS (siehe README), weil sie erst mit deinem Konto geprüft werden.
export const FORMATS = {
  '30x40-rahmen': {
    label: '30 × 40 cm, gerahmt',
    short: '30×40 gerahmt',
    widthMm: 300,
    heightMm: 400,
    priceChf: 89,
    frames: {
      natur: 'Holz natur',
      schwarz: 'Schwarz',
      weiss: 'Weiss',
    },
    defaultFrame: 'natur',
  },
  '50x70-poster': {
    label: '50 × 70 cm, ohne Rahmen',
    short: '50×70 Poster',
    widthMm: 500,
    heightMm: 700,
    priceChf: 59,
    frames: null,
    defaultFrame: null,
  },
};

export const DEFAULT_FORMAT = '30x40-rahmen';

// Auflösungen
export const PRINT_DPI = 300; // Druckdatei
// Die Karte wird so gerendert, als wäre sie mit 150 dpi gedruckt, und dann auf
// 300 dpi hochgerechnet. Grund: Die Schrift in den swisstopo-Kacheln ist für
// Bildschirme gemacht. Bei echten 300 dpi wären Ortsnamen nur ~0.8 mm hoch.
// Bei 150 dpi sind sie ~1.7 mm hoch (ähnlich wie auf einer gedruckten Landeskarte).
export const MAP_DPI = 150;

// swisstopo WMTS (Landeskarte farbig, Web-Mercator). Lizenz: OGD, Quellenangabe Pflicht.
export const TILE_URL =
  'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
export const TILE_SIZE = 256;
export const MAX_TILE_ZOOM = 18;
export const MIN_MAP_ZOOM = 7;
export const MAX_MAP_ZOOM = 18;
// Grob die Schweiz + Liechtenstein mit etwas Rand
export const MAX_BOUNDS = [
  [5.6, 45.65],
  [10.75, 47.95],
];

export const CREDIT = '© swisstopo';

// Textlimiten
export const LIMITS = {
  title: 32,
  place: 40,
  date: 30,
};

export const COLORS = {
  paper: '#fffdf8',
  ink: '#1f2a37',
  muted: '#5b6573',
  heart: '#c8102e',
  heartStroke: '#ffffff',
  border: '#1f2a37',
};

export const DEFAULT_TEXT = {
  title: 'Wo alles begann',
  place: '',
  date: '',
};
