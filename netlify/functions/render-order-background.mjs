// Background Function (bis 15 Min.): rendert die Druckdatei, übermittelt an Gelato,
// sendet die Bestätigung. Aufruf nur intern (x-internal-secret).
import { processOrder } from '../lib/pipeline.js';
import { isInternal } from '../lib/util.js';

export default async (req) => {
  if (!isInternal(req)) return new Response('Nicht erlaubt', { status: 401 });
  const { orderId, forceRender } = await req.json().catch(() => ({}));
  if (!orderId) return new Response('orderId fehlt', { status: 400 });
  try {
    await processOrder(orderId, { forceRender: !!forceRender });
  } catch (e) {
    // Fehler sind im Auftrag protokolliert und per ntfy gemeldet
    console.error(orderId, e);
  }
  return new Response('ok');
};
