// Gelato Order API v4.
// Doku: https://dashboard.gelato.com/docs/orders/v4/create/
// GELATO_ORDER_TYPE=draft (Standard) legt nur Entwürfe an: nichts wird gedruckt
// oder verrechnet, bis du den Entwurf im Gelato-Dashboard freigibst.
// Für den Live-Betrieb GELATO_ORDER_TYPE=order setzen.
import { env } from './util.js';

const ORDERS = 'https://order.gelato.com/v4/orders';

function headers() {
  return { 'content-type': 'application/json', 'X-API-KEY': env('GELATO_API_KEY') };
}

/** Produkt-ID aus GELATO_PRODUCT_UIDS (JSON), Schlüssel "format:rahmen" oder "format". */
export function productUid(format, frame) {
  let map = {};
  try {
    map = JSON.parse(process.env.GELATO_PRODUCT_UIDS || '{}');
  } catch {
    throw new Error('GELATO_PRODUCT_UIDS ist kein gültiges JSON');
  }
  const uid = map[frame ? `${format}:${frame}` : format] || map[format];
  if (!uid) throw new Error(`Keine Gelato-Produkt-ID für ${format}${frame ? ':' + frame : ''} in GELATO_PRODUCT_UIDS`);
  return uid;
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return { firstName: parts[0] || '-', lastName: parts[0] || '-' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}

export function buildOrderPayload(order, fileUrl) {
  const a = order.shipping?.address || {};
  const { firstName, lastName } = splitName(order.shipping?.name);
  const payload = {
    orderType: process.env.GELATO_ORDER_TYPE === 'order' ? 'order' : 'draft',
    // Bei einem Nachdruck braucht Gelato eine neue Referenz
    orderReferenceId: order.reprints ? `${order.id}-R${order.reprints}` : order.id,
    customerReferenceId: order.id,
    currency: 'CHF',
    items: [
      {
        itemReferenceId: `${order.id}-${(order.reprints || 0) + 1}`,
        productUid: productUid(order.design.format, order.design.frame),
        files: [{ type: 'default', url: fileUrl }],
        quantity: 1,
      },
    ],
    shippingAddress: {
      firstName,
      lastName,
      addressLine1: a.line1 || '',
      addressLine2: a.line2 || '',
      city: a.city || '',
      postCode: a.postal_code || '',
      country: a.country || 'CH',
      email: order.email || '',
      phone: order.phone || '',
    },
  };
  if (process.env.GELATO_SHIPMENT_METHOD) payload.shipmentMethodUid = process.env.GELATO_SHIPMENT_METHOD;
  return payload;
}

export async function createOrder(order, fileUrl) {
  const payload = buildOrderPayload(order, fileUrl);
  const res = await fetch(ORDERS, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Gelato lehnt Auftrag ab (HTTP ${res.status}): ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return { id: data.id, status: data.fulfillmentStatus || data.orderType, raw: data };
}

export async function getGelatoOrder(gelatoId) {
  const res = await fetch(`${ORDERS}/${gelatoId}`, { headers: headers() });
  if (!res.ok) throw new Error(`Gelato-Abfrage fehlgeschlagen (HTTP ${res.status})`);
  return res.json();
}

/** Liest Tracking-Infos aus einer Gelato-Order- oder Webhook-Struktur. */
export function extractTracking(obj) {
  const found = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (o.trackingCode || o.trackingUrl) found.push({ code: o.trackingCode, url: o.trackingUrl });
    for (const v of Object.values(o)) walk(v);
  };
  walk(obj);
  return found.find((t) => t.url) || found[0] || null;
}
