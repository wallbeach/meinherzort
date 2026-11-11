// Admin-API (Bearer ADMIN_TOKEN)
// GET  /api/admin/orders                 letzte Aufträge
// GET  /api/admin/preview?id=HZ-...      Vorschaubild
// POST /api/admin/action {id, action}    rerender | resubmit | reprint | refund | cancel | note
import { listOrders, getOrder, getFile, updateOrder } from '../lib/store.js';
import { stripe } from '../lib/stripe.js';
import { json, isAdmin, triggerRender } from '../lib/util.js';
import { STATUS } from '../lib/pipeline.js';

export default async (req) => {
  if (!isAdmin(req)) return json({ error: 'Nicht angemeldet' }, 401);
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, '');

  if (req.method === 'GET' && route === 'orders') {
    const orders = await listOrders({ limit: 60 });
    return json({
      statusLabels: STATUS,
      orders: orders
        .filter((o) => o.status !== 'pending' || Date.now() - new Date(o.createdAt) < 3 * 86400e3)
        .map((o) => ({
          id: o.id,
          createdAt: o.createdAt,
          status: o.status,
          design: o.design,
          amountChf: o.amountChf,
          email: o.email,
          name: o.shipping?.name,
          city: o.shipping?.address?.city,
          gelato: o.gelato,
          tracking: o.tracking,
          lastError: o.lastError,
          livemode: o.livemode,
          hasPreview: !!o.files?.preview,
          log: (o.log || []).slice(-8),
        })),
    });
  }

  if (req.method === 'GET' && route === 'preview') {
    const o = await getOrder(url.searchParams.get('id'));
    if (!o?.files?.preview) return new Response('Keine Vorschau', { status: 404 });
    const f = await getFile(o.files.preview);
    return new Response(f.data, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=600' } });
  }

  if (req.method === 'POST' && route === 'action') {
    const { id, action, note } = await req.json().catch(() => ({}));
    const o = id && (await getOrder(id));
    if (!o) return json({ error: 'Auftrag nicht gefunden' }, 404);

    switch (action) {
      case 'rerender':
        // Neue Druckdatei; wenn noch nicht bei Gelato, wird danach übermittelt
        await updateOrder(id, { status: 'paid' }, 'Admin: neu rendern');
        await triggerRender(id, { forceRender: true });
        return json({ ok: true });
      case 'resubmit':
        // Nach Gelato-Fehler erneut übermitteln (gleiche Druckdatei)
        await updateOrder(id, { status: 'rendered', gelato: null }, 'Admin: erneut an Gelato');
        await triggerRender(id);
        return json({ ok: true });
      case 'reprint':
        // Nachdruck: neuer Gelato-Auftrag mit neuer Referenz
        await updateOrder(id, { status: 'rendered', gelato: null, reprints: (o.reprints || 0) + 1, tracking: null, mails: { ...(o.mails || {}), shipping: null } }, 'Admin: Nachdruck ausgelöst');
        await triggerRender(id);
        return json({ ok: true });
      case 'refund': {
        if (!o.paymentIntent) return json({ error: 'Keine Zahlung vorhanden' }, 400);
        const r = await stripe().refunds.create({ payment_intent: o.paymentIntent, metadata: { orderId: id } });
        await updateOrder(id, { status: 'refunded', refundId: r.id }, `Admin: rückerstattet (${r.status})`);
        return json({ ok: true, refund: r.status });
      }
      case 'cancel':
        await updateOrder(id, { status: 'canceled' }, 'Admin: storniert');
        return json({ ok: true });
      case 'note':
        await updateOrder(id, {}, `Notiz: ${String(note || '').slice(0, 300)}`);
        return json({ ok: true });
      default:
        return json({ error: 'Unbekannte Aktion' }, 400);
    }
  }
  return json({ error: 'Nicht gefunden' }, 404);
};

export const config = { path: ['/api/admin/orders', '/api/admin/preview', '/api/admin/action'] };
