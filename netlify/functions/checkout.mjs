// POST /api/checkout  -> legt Auftrag an und erstellt Stripe-Checkout-Session
import { validateDesign } from '../../public/shared/validate.js';
import { FORMATS } from '../../public/shared/config.js';
import { newOrderId, saveOrder } from '../lib/store.js';
import { stripe } from '../lib/stripe.js';
import { json, siteUrl } from '../lib/util.js';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ungültige Anfrage' }, 400);
  }
  if (body.approved !== true) return json({ error: 'Bitte bestätige zuerst die Vorschau.' }, 400);
  const { ok, errors, design } = validateDesign(body.design);
  if (!ok) return json({ error: errors.join(' ') }, 400);

  const f = FORMATS[design.format];
  const id = newOrderId();
  const order = {
    id,
    createdAt: new Date().toISOString(),
    status: 'pending',
    design,
    amountChf: f.priceChf,
    source: String(body.source || '').slice(0, 40) || null, // z.B. Gutschein-/Kampagnenquelle
    log: [{ at: new Date().toISOString(), msg: 'Checkout gestartet' }],
  };
  await saveOrder(order);

  const frameLabel = f.frames ? ` · Rahmen ${f.frames[design.frame]}` : '';
  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      locale: 'de',
      client_reference_id: id,
      metadata: { orderId: id },
      payment_intent_data: { metadata: { orderId: id } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'chf',
            unit_amount: Math.round(f.priceChf * 100),
            product_data: {
              name: `Kartenposter «${design.title}»`,
              description: `${f.label}${frameLabel}. Personalisiert, Versand inklusive.`,
            },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: ['CH', 'LI'] },
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/danke.html?o=${id}`,
      cancel_url: `${siteUrl()}/?abgebrochen=1`,
    });
    order.stripeSessionId = session.id;
    await saveOrder(order);
    return json({ url: session.url, orderId: id });
  } catch (e) {
    console.error(e);
    return json({ error: 'Die Zahlung konnte nicht gestartet werden. Bitte versuch es später nochmals.' }, 502);
  }
};

export const config = { path: '/api/checkout' };
