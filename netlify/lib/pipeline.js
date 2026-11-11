// Ablauf nach der Zahlung: rendern -> ablegen -> Gelato -> Bestätigungsmail.
// Jeder Schritt ist wiederholbar (idempotent über den Auftragsstatus).
import { getOrder, updateOrder, putFile } from './store.js';
import { renderPoster } from './render.js';
import { createOrder } from './gelato.js';
import { sendOrderConfirmation } from './mail.js';
import { notify } from './notify.js';
import { signedFileUrl } from './util.js';

export const STATUS = {
  pending: 'Zahlung offen',
  paid: 'Bezahlt',
  rendering: 'Wird gerendert',
  rendered: 'Gerendert',
  submitted: 'Bei Gelato',
  in_production: 'In Produktion',
  shipped: 'Versendet',
  delivered: 'Zugestellt',
  render_failed: 'Renderfehler',
  gelato_failed: 'Gelato-Fehler',
  canceled: 'Storniert',
  refunded: 'Rückerstattet',
};

export async function renderStep(orderId) {
  const order = await updateOrder(orderId, { status: 'rendering', renderAttempts: ((await getOrder(orderId))?.renderAttempts || 0) + 1 }, 'Rendering gestartet');
  try {
    const out = await renderPoster(order.design);
    const printKey = `print/${order.id}.jpg`;
    const previewKey = `preview/${order.id}.jpg`;
    await putFile(printKey, out.print, 'image/jpeg');
    await putFile(previewKey, out.preview, 'image/jpeg');
    const warn = out.meta.missingTiles ? ` (${out.meta.missingTiles} leere Kacheln)` : '';
    return await updateOrder(
      order.id,
      { status: 'rendered', files: { print: printKey, preview: previewKey }, renderMeta: out.meta },
      `Gerendert ${out.meta.widthPx}×${out.meta.heightPx}px, ${out.meta.tileCount} Kacheln${warn}`,
    );
  } catch (e) {
    await updateOrder(order.id, { status: 'render_failed', lastError: String(e.message || e) }, `Renderfehler: ${e.message}`);
    await notify('Renderfehler', `${order.id}: ${e.message}`, { orderId: order.id });
    throw e;
  }
}

export async function submitStep(orderId) {
  const order = await getOrder(orderId);
  if (order.gelato?.id) return order; // schon übermittelt
  try {
    const url = signedFileUrl(order.files.print, 30);
    const res = await createOrder(order, url);
    return await updateOrder(
      order.id,
      { status: 'submitted', gelato: { id: res.id, status: res.status, type: process.env.GELATO_ORDER_TYPE === 'order' ? 'order' : 'draft' } },
      `An Gelato übermittelt (${res.id})`,
    );
  } catch (e) {
    await updateOrder(order.id, { status: 'gelato_failed', lastError: String(e.message || e) }, `Gelato-Fehler: ${e.message}`);
    await notify('Gelato-Ablehnung', `${order.id}: ${e.message}`, { orderId: order.id });
    throw e;
  }
}

export async function confirmStep(orderId) {
  const order = await getOrder(orderId);
  if (order.mails?.confirmation) return order;
  try {
    await sendOrderConfirmation(order);
    return updateOrder(order.id, { mails: { ...(order.mails || {}), confirmation: new Date().toISOString() } }, 'Bestätigungsmail gesendet');
  } catch (e) {
    await notify('Mailfehler', `${order.id}: ${e.message}`, { orderId: order.id, priority: 'default' });
    return order;
  }
}

/** Ganzer Ablauf. Überspringt Schritte, die schon erledigt sind. */
export async function processOrder(orderId, { forceRender = false } = {}) {
  let order = await getOrder(orderId);
  if (!order) throw new Error(`Auftrag ${orderId} nicht gefunden`);
  if (['canceled', 'refunded'].includes(order.status)) return order;
  if (forceRender || !order.files?.print) order = await renderStep(orderId);
  if (!order.gelato?.id) order = await submitStep(orderId);
  order = await confirmStep(orderId);
  return order;
}
