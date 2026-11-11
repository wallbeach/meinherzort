// POST /api/contact  Kontaktformular -> Mail an SUPPORT_EMAIL + Handy-Meldung
import { sendContactMail } from '../lib/mail.js';
import { notify } from '../lib/notify.js';
import { json } from '../lib/util.js';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.website) return json({ ok: true }); // Honeypot gegen Spam
  const name = String(b.name || '').slice(0, 80).trim();
  const email = String(b.email || '').slice(0, 120).trim();
  const message = String(b.message || '').slice(0, 3000).trim();
  const orderId = String(b.orderId || '').slice(0, 30).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || message.length < 5) {
    return json({ error: 'Bitte E-Mail und Nachricht ausfüllen.' }, 400);
  }
  try {
    await sendContactMail({ name, email, message, orderId });
  } catch (e) {
    console.error(e);
  }
  await notify('Kundenanfrage', `${name || email}${orderId ? ' (' + orderId + ')' : ''}: ${message.slice(0, 200)}`, {
    tags: ['envelope'],
    priority: 'default',
    orderId: orderId || undefined,
  });
  return json({ ok: true });
};

export const config = { path: '/api/contact' };
