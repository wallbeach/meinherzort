// Holt eine Gelato-Offerte (Produkt + Versand in die Schweiz). Löst KEINE Bestellung aus.
// Aufruf:
//   GELATO_API_KEY=... node scripts/gelato-quote.mjs <productUid> [PLZ]
const KEY = process.env.GELATO_API_KEY;
const [productUid, postCode = '4323'] = process.argv.slice(2);
if (!KEY || !productUid) {
  console.error('Aufruf: GELATO_API_KEY=... node scripts/gelato-quote.mjs <productUid> [PLZ]');
  process.exit(1);
}
const body = {
  orderReferenceId: `quote-${Date.now()}`,
  customerReferenceId: 'quote',
  currency: 'CHF',
  allowMultipleQuotes: true,
  recipient: {
    country: 'CH', firstName: 'Test', lastName: 'Kunde', addressLine1: 'Teststrasse 1',
    city: 'Testort', postCode, email: 'test@example.com',
  },
  products: [{ itemReferenceId: 'i1', productUid, files: [{ type: 'default', url: 'https://example.com/x.jpg' }], quantity: 1 }],
};
const r = await fetch('https://order.gelatoapis.com/v4/orders:quote', {
  method: 'POST',
  headers: { 'X-API-KEY': KEY, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const data = await r.json().catch(async () => ({ raw: await r.text() }));
if (!r.ok) {
  console.error('HTTP', r.status, JSON.stringify(data, null, 2));
  process.exit(1);
}
for (const q of data.quotes || []) {
  console.log(`\nProduktion: ${q.fulfillmentCountry || '?'}`);
  for (const p of q.products || []) console.log(`  Produkt: ${p.price} ${p.currency}`);
  for (const s of q.shipmentMethods || []) {
    console.log(`  Versand ${s.name}: ${s.price} ${s.currency}, ${s.minDeliveryDays}-${s.maxDeliveryDays} Tage`);
  }
}
