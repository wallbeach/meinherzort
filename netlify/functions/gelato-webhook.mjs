// POST /api/gelato-webhook  Status- und Tracking-Updates von Gelato
// In Gelato unter Developer -> Webhooks: Header-Name "x-webhook-secret",
// Header-Wert = GELATO_WEBHOOK_SECRET.
import { applyGelatoUpdate } from '../lib/gelato-sync.js';
import { json, safeEqual } from '../lib/util.js';

export default async (req) => {
  const secret = process.env.GELATO_WEBHOOK_SECRET;
  const given = req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('secret');
  if (!secret || !safeEqual(given, secret)) return json({ error: 'Nicht erlaubt' }, 401);
  const ev = await req.json().catch(() => null);
  if (!ev) return json({ error: 'Kein JSON' }, 400);
  const ref = String(ev.orderReferenceId || '').replace(/-R\d+$/, '');
  if (ref) await applyGelatoUpdate(ref, ev);
  return json({ ok: true });
};

export const config = { path: '/api/gelato-webhook' };
