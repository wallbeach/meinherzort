# meinherzort.ch – Kartenposter «Wo alles begann»

Personalisierte Poster im Stil der Schweizer Landeskarte (swisstopo), gedruckt und versendet von Gelato.
Betrieb ohne Handarbeit: Kunde gestaltet → bezahlt (Stripe, TWINT) → Server rendert 300 dpi → Gelato druckt → Mails per Brevo.
Du wirst nur bei Ausnahmen per ntfy aufs Handy benachrichtigt.

## Ablauf

```
Browser (public/app.js)
  ├─ Ortssuche: api3.geo.admin.ch SearchServer
  ├─ Karte: MapLibre + swisstopo WMTS (pixelkarte-farbe), exakt wie im Druck skaliert
  └─ POST /api/checkout ──► Auftrag in Netlify Blobs (pending) ──► Stripe Checkout
Stripe ──► /api/stripe-webhook (checkout.session.completed) ──► Status paid
        └─► render-order-background (bis 15 Min.)
              1. Kacheln laden, 300-dpi-JPEG rendern, Vorschau ablegen
              2. Gelato-Auftrag (Standard: Entwurf!)
              3. Bestätigungsmail (Brevo)
Gelato ──► /api/gelato-webhook ──► Status, Tracking ──► Versandmail
Täglich 06:00 UTC: reconcile (hängende Aufträge neu starten, Gelato-Status abfragen, Probleme melden)
```

## Warum die Vorschau exakt dem Druck entspricht

- Layout und Texte (`public/shared/poster.js`) erzeugen **dasselbe SVG** im Browser und auf dem Server (gleiche Schriften, gleiche Glyphen).
- Die Karte wird im Browser in Originalgrösse bei 150 dpi aufgebaut und nur per CSS verkleinert. Der Server rechnet mit derselben Kachelstufe (`round(zoom+1)`, wie MapLibre) und skaliert auf 300 dpi hoch.
- Warum 150 statt 300 dpi für die Karte: Die Schrift in den Kacheln ist für Bildschirme gemacht. Bei echten 300 dpi wären Ortsnamen ~0.8 mm hoch, so sind sie ~1.7 mm. Das ist in `public/shared/config.js` als `MAP_DPI` einstellbar.

## Dateien

| Pfad | Zweck |
|---|---|
| `public/index.html`, `app.js`, `style.css` | Generator |
| `public/shared/*` | Gemeinsamer Code Browser + Server (Formate, Preise, Layout, Geometrie, Validierung) |
| `public/admin.html` | Admin fürs Handy: Aufträge, Vorschau, neu rendern, Nachdruck, Rückerstattung |
| `public/agb.html`, `datenschutz.html`, `impressum.html` | **Entwürfe** mit Platzhaltern |
| `netlify/functions/*` | Checkout, Webhooks, Rendering, Dateien, Admin-API, Kontakt, täglicher Abgleich |
| `netlify/lib/*` | Rendering, Ablage, Gelato, Stripe, Brevo, ntfy |
| `scripts/` | Tests, Render-Test, Gelato-Produktsuche und Offerte |

## Einrichten (Reihenfolge)

1. **Netlify:** Neues Projekt aus GitHub `wallbeach/meinherzort`. Build-Einstellungen kommen aus `netlify.toml`.
2. **Geheimnisse:** Alle Werte aus `.env.example` unter *Project configuration → Environment variables* eintragen (Scope: Functions). Zufallswerte: `openssl rand -hex 32`.
3. **Gelato:**
   - Developer → API Keys → Key anlegen → `GELATO_API_KEY`.
   - Lokal: `GELATO_API_KEY=... node scripts/gelato-products.mjs` → Produkt-IDs für 30×40 Holzrahmen (natur/schwarz/weiss) und 50×70 Poster in `GELATO_PRODUCT_UIDS` eintragen.
   - Preise und Versand: `GELATO_API_KEY=... node scripts/gelato-quote.mjs <productUid>` (keine Bestellung).
   - Developer → Webhooks: URL `https://meinherzort.ch/api/gelato-webhook`, Events *order_status_updated* und *order_item_tracking_code_updated*, Header-Name `x-webhook-secret`, Header-Wert = `GELATO_WEBHOOK_SECRET`.
   - Bis zum Livegang `GELATO_ORDER_TYPE=draft`: Aufträge erscheinen als Entwurf und werden erst gedruckt, wenn du sie im Gelato-Dashboard freigibst.
4. **Stripe (Testmodus):**
   - Developers → API keys → `sk_test_...` → `STRIPE_SECRET_KEY`.
   - Developers → Webhooks → Endpoint `https://<site>/api/stripe-webhook`, Event `checkout.session.completed` (und `checkout.session.async_payment_succeeded`) → Signing secret → `STRIPE_WEBHOOK_SECRET`.
   - Settings → Payment methods: TWINT aktivieren (nur CHF). Promotion-Codes für Gutscheine (z. B. für deinhochzeitsantrag.ch) unter Products → Coupons.
   - Live-Key nur mit `ALLOW_LIVE_PAYMENTS=true`. Ohne diese Freigabe verweigert der Server echte Zahlungen.
5. **Brevo:** Absenderadresse/Domain verifizieren (SPF/DKIM), API-Key → `BREVO_API_KEY`.
6. **ntfy:** App installieren, Thema `NTFY_TOPIC` abonnieren. Meldungen kommen nur bei Renderfehler, Gelato-Problem, Mailfehler, Kundenanfrage, Abgleich-Problemen.
7. **Domain:** meinherzort.ch registrieren und in Netlify verbinden, dann `PUBLIC_SITE_URL` setzen.

## Testen

```bash
npm install
npm test                                   # Kernlogik + schnelles Rendering mit Ersatzkacheln
node scripts/test-render.mjs 30x40-rahmen  # volle 300 dpi mit Ersatzkacheln -> scripts/out/
node scripts/test-render.mjs 50x70-poster --real   # mit echten swisstopo-Kacheln (Netz nötig)
npx netlify dev                            # lokal mit Functions
```

Testbestellung im Stripe-Testmodus: Karte `4242 4242 4242 4242`, beliebiges Datum/CVC.

## Betrieb vom Handy

- `https://meinherzort.ch/admin.html` mit `ADMIN_TOKEN` anmelden (bleibt im Browser gespeichert).
- **Neu rendern**: neue Druckdatei (z. B. nach Code-Fix). Ist der Auftrag schon bei Gelato, danach **Nachdruck**.
- **Erneut an Gelato**: nach Gelato-Fehler.
- **Nachdruck**: neuer Gelato-Auftrag (z. B. Transportschaden). Kostet nochmals.
- **Rückerstatten**: voller Betrag über Stripe.

## Lizenz und Recht

- Kartendaten: swisstopo, Open Government Data, Quellenangabe «© swisstopo» ist auf jedem Poster und auf der Website.
- **Nicht** verwenden: die Basiskarte (Vector Tiles) und den Luftbild-Stil «Imagery Base Map». Sie brauchen für kommerzielle Nutzung eine Bewilligung.
- Fair Use geo.admin.ch: Ein Poster lädt ~30–200 Kacheln, gedrosselt auf 6 parallel. Bei grossem Volumen vorher info@geo.admin.ch kontaktieren.
- Keine Wappen (Wappenschutzgesetz), keine Lizenzfiguren.
- Schriften: DM Serif Display und Inter (SIL Open Font License). Herz-Symbol: Material Icons (Apache 2.0).

## Offen vor dem Livegang

- [ ] Gelato-Produkt-IDs, Rand/Beschnitt-Anforderungen der Produkte prüfen (Datei hat aktuell keinen Beschnitt; bei gerahmten Postern deckt der Rahmen einige mm ab → Musterbestellung!)
- [ ] Musterbestellung 30×40 und 50×70: Druckqualität, Lesbarkeit der Ortsnamen, Lieferzeit, Produktionsland
- [ ] AGB, Datenschutz, Impressum ausfüllen (Betreiber-Firma)
- [ ] MWST-Pflicht klären (Preise inkl./exkl.)
- [ ] Erfolgskriterien und Werbetest (siehe Projektnotizen)
