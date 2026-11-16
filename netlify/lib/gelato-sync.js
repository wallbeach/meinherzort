// Wendet ein Gelato-Update (Webhook oder Abfrage) auf einen Auftrag an.
import { getOrder, updateOrder } from './store.js';
import { extractTracking } from './gelato.js';
import { sendShippingMail } from './mail.js';
import { notify } from './notify.js';

const MAP = {
  created: 'submitted',
  passed: 'submitted',
  pending_approval: 'submitted',
  draft: 'submitted',
  in_production: 'in_production',
  printed: 'in_production',
  shipped: 'shipped',
  in_transit: 'shipped',
  delivered: 'delivered',
  canceled: 'canceled',
  cancelled: 'canceled',
  failed: 'gelato_failed',
  not_connected: 'gelato_failed',
  on_hold: 'gelato_failed',
};

export async function applyGelatoUpdate(orderId, ev) {
  const order = await getOrder(orderId);
  if (!order) return null;
  const gStatus = String(ev.fulfillmentStatus || ev.status || '').toLowerCase();
  const tracking = extractTracking(ev);
  const patch = { gelato: { ...(order.gelato || {}), status: gStatus || order.gelato?.status } };
  if (MAP[gStatus] && !['refunded'].includes(order.status)) patch.status = MAP[gStatus];
  if (tracking && (tracking.url || tracking.code)) patch.tracking = tracking;
  if (tracking && order.status !== 'shipped' && !patch.status) patch.status = 'shipped';
  let updated = await updateOrder(orderId, patch, `Gelato: ${gStatus || ev.event}${tracking?.code ? ' · ' + tracking.code : ''}`);

  if ((updated.status === 'shipped' || updated.status === 'delivered') && updated.tracking && !updated.mails?.shipping) {
    try {
      const res = await sendShippingMail(updated);
      if (!res?.skipped) updated = await updateOrder(orderId, { mails: { ...(updated.mails || {}), shipping: new Date().toISOString() } }, 'Versandmail gesendet');
    } catch (e) {
      await notify('Mailfehler', `${orderId}: ${e.message}`, { orderId, priority: 'default' });
    }
  }
  if (['gelato_failed', 'canceled'].includes(patch.status)) {
    await notify('Gelato-Problem', `${orderId}: Status ${gStatus}`, { orderId });
  }
  return updated;
}

