// POST /api/stripe-webhook  (Stripe-Ereignis checkout.session.completed)
import { stripe } from '../lib/stripe.js';
import { getOrder, updateOrder } from '../lib/store.js';
import { json, env, triggerRender } from '../lib/util.js';
import { notify } from '../lib/notify.js';

export default async (req) => {
  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, env('STRIPE_WEBHOOK_SECRET'));
  } catch (e) {
    console.error('Stripe-Signatur ungültig', e.message);
    return json({ error: 'Signatur ungültig' }, 400);
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    const id = s.metadata?.orderId || s.client_reference_id;
    const order = id && (await getOrder(id));
    if (!order) {
      await notify('Unbekannte Zahlung', `Stripe-Session ${s.id} ohne passenden Auftrag`);
      return json({ ok: true });
    }
    if (s.payment_status !== 'paid') {
      await updateOrder(id, {}, `Checkout abgeschlossen, Zahlung noch offen (${s.payment_status})`);
      return json({ ok: true });
    }
    if (order.status !== 'pending') return json({ ok: true, duplicate: true });

    const shipping = s.collected_information?.shipping_details || s.shipping_details || {};
    await updateOrder(
      id,
      {
        status: 'paid',
        paidAt: new Date().toISOString(),
        email: s.customer_details?.email,
        phone: s.customer_details?.phone || '',
        shipping: { name: shipping.name || s.customer_details?.name, address: shipping.address },
        amountChf: (s.amount_total || 0) / 100,
        paymentIntent: s.payment_intent,
        livemode: s.livemode,
      },
      `Bezahlt (CHF ${((s.amount_total || 0) / 100).toFixed(2)})`,
    );
    try {
      await triggerRender(id);
    } catch (e) {
      // Der tägliche Abgleich versucht es erneut
      await notify('Render-Start fehlgeschlagen', `${id}: ${e.message}`, { orderId: id });
    }
  }
  return json({ ok: true });
};

export const config = { path: '/api/stripe-webhook' };
