// Stripe-Client mit Sicherheitsbremse: Live-Schlüssel werden nur akzeptiert,
// wenn ALLOW_LIVE_PAYMENTS=true gesetzt ist (bewusste Freigabe für echte Zahlungen).
import Stripe from 'stripe';
import { env } from './util.js';

let client;
export function stripe() {
  if (client) return client;
  const key = env('STRIPE_SECRET_KEY');
  if (key.startsWith('sk_live') && process.env.ALLOW_LIVE_PAYMENTS !== 'true') {
    throw new Error('Live-Stripe-Schlüssel gesetzt, aber ALLOW_LIVE_PAYMENTS ist nicht "true". Echte Zahlungen sind gesperrt.');
  }
  client = new Stripe(key);
  return client;
}

export function isLiveMode() {
  return (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live');
}
