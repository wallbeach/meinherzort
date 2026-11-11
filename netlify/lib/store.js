// Auftrags- und Dateiablage in Netlify Blobs.
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const orders = () => getStore({ name: 'orders', consistency: 'strong' });
const files = () => getStore({ name: 'files', consistency: 'strong' });

export function newOrderId() {
  const d = new Date();
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, '');
  const rnd = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `HZ-${ymd}-${rnd}`;
}

export async function getOrder(id) {
  return orders().get(id, { type: 'json' });
}

export async function saveOrder(order) {
  order.updatedAt = new Date().toISOString();
  await orders().setJSON(order.id, order);
  return order;
}

/** Ändert einen Auftrag und protokolliert den Schritt. */
export async function updateOrder(id, patch, logLine) {
  const order = await getOrder(id);
  if (!order) throw new Error(`Auftrag ${id} nicht gefunden`);
  Object.assign(order, patch);
  if (logLine) {
    order.log = order.log || [];
    order.log.push({ at: new Date().toISOString(), msg: logLine });
    if (order.log.length > 60) order.log = order.log.slice(-60);
  }
  return saveOrder(order);
}

export async function listOrders({ limit = 100 } = {}) {
  const { blobs } = await orders().list();
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const out = await Promise.all(keys.map((k) => orders().get(k, { type: 'json' })));
  return out.filter(Boolean).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function putFile(key, buffer, contentType) {
  await files().set(key, buffer, { metadata: { contentType } });
}

export async function getFile(key) {
  const res = await files().getWithMetadata(key, { type: 'arrayBuffer' });
  if (!res) return null;
  return { data: Buffer.from(res.data), contentType: res.metadata?.contentType || 'application/octet-stream' };
}
