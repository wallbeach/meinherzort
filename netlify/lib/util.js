// Kleine Hilfsfunktionen für die Netlify Functions.
import crypto from 'node:crypto';

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

export function env(name, { required = true } = {}) {
  const v = process.env[name];
  if (required && !v) throw new Error(`Umgebungsvariable ${name} fehlt (siehe README)`);
  return v;
}

export function siteUrl() {
  return (process.env.PUBLIC_SITE_URL || process.env.URL || 'http://localhost:8888').replace(/\/$/, '');
}

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Signierte, ablaufende URL für eine Datei in Netlify Blobs (für Gelato und Mails). */
export function signedFileUrl(key, days = 30) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const t = hmac(env('FILE_URL_SECRET'), `${key}:${exp}`);
  return `${siteUrl()}/api/file?k=${encodeURIComponent(key)}&e=${exp}&t=${t}`;
}

export function verifyFileToken(key, exp, token) {
  if (!key || !exp || !token) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(hmac(env('FILE_URL_SECRET'), `${key}:${exp}`), token);
}

export function isAdmin(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return !!process.env.ADMIN_TOKEN && safeEqual(token, process.env.ADMIN_TOKEN);
}

export function isInternal(req) {
  return !!process.env.INTERNAL_SECRET && safeEqual(req.headers.get('x-internal-secret'), process.env.INTERNAL_SECRET);
}

/** Startet die Render-Background-Function (antwortet sofort mit 202). */
export async function triggerRender(orderId, { forceRender = false } = {}) {
  const res = await fetch(`${siteUrl()}/.netlify/functions/render-order-background`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': env('INTERNAL_SECRET') },
    body: JSON.stringify({ orderId, forceRender }),
  });
  if (!res.ok && res.status !== 202) throw new Error(`Render-Start fehlgeschlagen: HTTP ${res.status}`);
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
