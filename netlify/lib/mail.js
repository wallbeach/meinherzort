// Transaktionsmails per Brevo.
import { escapeHtml, signedFileUrl, siteUrl } from './util.js';
import { FORMATS, BRAND } from '../../public/shared/config.js';

async function send({ to, subject, html, replyTo }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.warn('[mail] BREVO_API_KEY fehlt, Mail nur geloggt:', subject, to);
    return { skipped: true };
  }
  const body = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || BRAND.name },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };
  if (replyTo) body.replyTo = { email: replyTo };
  if (process.env.MAIL_BCC) body.bcc = [{ email: process.env.MAIL_BCC }];
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Brevo HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const wrap = (inner) => `<!doctype html><html><body style="margin:0;background:#f6f3ec;font-family:Helvetica,Arial,sans-serif;color:#1f2a37">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-family:Georgia,serif;font-size:22px;margin:0 0 18px">meinherzort</p>
<div style="background:#fff;border-radius:10px;padding:24px;line-height:1.55;font-size:15px">${inner}</div>
<p style="font-size:12px;color:#6b7280;margin-top:18px">Kartengrundlage © swisstopo · <a href="${siteUrl()}" style="color:#6b7280">${BRAND.domain}</a></p>
</div></body></html>`;

function describe(order) {
  const f = FORMATS[order.design.format];
  const frame = f.frames && order.design.frame ? `, Rahmen ${f.frames[order.design.frame]}` : '';
  return `${f.label}${frame}`;
}

export async function sendOrderConfirmation(order) {
  const img = order.files?.preview ? signedFileUrl(order.files.preview, 60) : null;
  const d = order.design;
  const html = wrap(`
<p>Hallo ${escapeHtml(order.shipping?.name?.split(' ')[0] || '')}</p>
<p>Danke für deine Bestellung! Dein Poster geht jetzt in den Druck. Sobald es unterwegs ist, bekommst du eine Mail mit der Sendungsverfolgung.</p>
${img ? `<p><img src="${img}" alt="Vorschau deines Posters" style="width:100%;max-width:320px;border:1px solid #e5e7eb"></p>` : ''}
<p style="margin:0"><strong>${escapeHtml(d.title)}</strong><br>${escapeHtml([d.place, d.date].filter(Boolean).join(' · '))}<br>${escapeHtml(describe(order))}</p>
<p style="color:#6b7280;font-size:13px">Bestellnummer ${order.id} · Total CHF ${order.amountChf?.toFixed(2)}</p>
<p>Fragen? Antworte einfach auf diese Mail.</p>`);
  return send({ to: order.email, subject: `Deine Bestellung ${order.id} ist eingegangen`, html, replyTo: process.env.SUPPORT_EMAIL });
}

export async function sendShippingMail(order) {
  const t = order.tracking || {};
  const html = wrap(`
<p>Hallo ${escapeHtml(order.shipping?.name?.split(' ')[0] || '')}</p>
<p>Dein Poster «${escapeHtml(order.design.title)}» ist unterwegs zu dir.</p>
${t.url ? `<p><a href="${t.url}" style="display:inline-block;background:#1f2a37;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Sendung verfolgen</a></p>` : ''}
${t.code ? `<p style="color:#6b7280;font-size:13px">Sendungsnummer ${escapeHtml(t.code)}</p>` : ''}
<p>Wir wünschen euch viel Freude damit.</p>`);
  return send({ to: order.email, subject: 'Dein Poster ist unterwegs', html, replyTo: process.env.SUPPORT_EMAIL });
}

export async function sendContactMail({ name, email, message, orderId }) {
  const to = process.env.SUPPORT_EMAIL;
  if (!to) return { skipped: true };
  const html = wrap(`<p><strong>Kundenanfrage</strong></p>
<p>Von: ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;${orderId ? `<br>Bestellung: ${escapeHtml(orderId)}` : ''}</p>
<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`);
  return send({ to, subject: `Anfrage von ${name || email}`, html, replyTo: email });
}
