// Sucht passende Gelato-Produkte und zeigt Preise für die Schweiz.
// Aufruf (lokal, Key nur in deiner Shell, nie ins Repo):
//   GELATO_API_KEY=... node scripts/gelato-products.mjs
// Ergebnis: Produkt-IDs für GELATO_PRODUCT_UIDS und Preise inkl. Versand (CHF).
const KEY = process.env.GELATO_API_KEY;
if (!KEY) {
  console.error('GELATO_API_KEY fehlt');
  process.exit(1);
}
const H = { 'X-API-KEY': KEY, 'content-type': 'application/json' };
const get = async (u) => {
  const r = await fetch(u, { headers: H });
  if (!r.ok) throw new Error(`${u} -> HTTP ${r.status} ${await r.text()}`);
  return r.json();
};
const post = async (u, b) => {
  const r = await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) });
  if (!r.ok) throw new Error(`${u} -> HTTP ${r.status} ${await r.text()}`);
  return r.json();
};

const catalogs = await get('https://product.gelatoapis.com/v3/catalogs');
const list = catalogs.data || catalogs;
console.log('Kataloge:', list.map((c) => c.catalogUid).join(', '));

const wanted = [
  { catalog: /framed[-_]?poster/i, size: /300x400|30x40/i, label: '30x40 gerahmt' },
  { catalog: /^posters?$/i, size: /500x700|50x70/i, label: '50x70 Poster' },
];

for (const w of wanted) {
  for (const c of list.filter((c) => w.catalog.test(c.catalogUid))) {
    let offset = 0;
    const hits = [];
    for (;;) {
      const res = await post(`https://product.gelatoapis.com/v3/catalogs/${c.catalogUid}/products:search`, { limit: 100, offset });
      const products = res.products || [];
      for (const p of products) if (w.size.test(p.productUid)) hits.push(p.productUid);
      if (products.length < 100) break;
      offset += 100;
    }
    console.log(`\n== ${w.label} (${c.catalogUid}): ${hits.length} Treffer`);
    for (const uid of hits.slice(0, 40)) {
      let price = '';
      try {
        const pr = await get(`https://product.gelatoapis.com/v3/products/${uid}/prices?country=CH&currency=CHF`);
        const first = (Array.isArray(pr) ? pr : pr.data || [])[0];
        if (first) price = `CHF ${first.price} (ab Menge ${first.quantity})`;
      } catch (e) {
        price = '(Preis nicht abrufbar)';
      }
      console.log(' ', uid, price);
    }
  }
}
console.log('\nVersandkosten zeigt erst eine Offerte. Wähle die Produkt-IDs und trage sie in GELATO_PRODUCT_UIDS ein, z.B.:');
console.log(JSON.stringify({ '30x40-rahmen:natur': '...', '30x40-rahmen:schwarz': '...', '30x40-rahmen:weiss': '...', '50x70-poster': '...' }));
