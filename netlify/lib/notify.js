// Handy-Benachrichtigung per ntfy (App «ntfy» installieren, Thema abonnieren).
// Wird nur bei Ausnahmen genutzt: Renderfehler, Gelato-Ablehnung, Kundenanfrage.
// Nutzt die JSON-Variante der ntfy-API, damit Umlaute im Titel funktionieren.
import { siteUrl } from './util.js';

const PRIORITY = { min: 1, low: 2, default: 3, high: 4, urgent: 5 };

export async function notify(title, message, { priority = 'high', tags = ['warning'], orderId } = {}) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.warn(`[notify] ${title}: ${message} (NTFY_TOPIC fehlt, nur geloggt)`);
    return;
  }
  const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
  const body = {
    topic,
    title,
    message,
    priority: PRIORITY[priority] || 4,
    tags,
  };
  if (orderId) body.click = `${siteUrl()}/admin.html#${orderId}`;
  const headers = { 'content-type': 'application/json' };
  if (process.env.NTFY_TOKEN) headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
  try {
    const res = await fetch(server, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) console.error('ntfy fehlgeschlagen', res.status, await res.text());
  } catch (e) {
    console.error('ntfy fehlgeschlagen', e);
  }
}
