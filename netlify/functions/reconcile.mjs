// Täglicher Abgleich (Scheduled Function, 06:00 UTC):
// - hängende Aufträge erneut anstossen (Webhook verpasst, Render abgebrochen)
// - Status bei Gelato abfragen (Fallback, falls Webhooks verloren gehen)
// - nur bei Problemen eine Handy-Meldung
import { listOrders, updateOrder } from '../lib/store.js';
import { getGelatoOrder } from '../lib/gelato.js';
import { applyGelatoUpdate } from '../lib/gelato-sync.js';
import { triggerRender } from '../lib/util.js';
import { notify } from '../lib/notify.js';

const MIN = 60 * 1000;
const age = (iso) => Date.now() - new Date(iso || 0).getTime();

export default async () => {
  const orders = await listOrders({ limit: 300 });
  const problems = [];

  for (const o of orders) {
    try {
      // Bezahlt oder Render hängt seit > 30 Min.
      if ((o.status === 'paid' || o.status === 'rendering') && age(o.updatedAt) > 30 * MIN) {
        if ((o.renderAttempts || 0) < 3) {
          await triggerRender(o.id);
          await updateOrder(o.id, {}, 'Abgleich: Verarbeitung neu gestartet');
        } else {
          problems.push(`${o.id}: Rendering nach 3 Versuchen nicht fertig`);
        }
      }
      // Gerendert, aber nicht übermittelt
      if (o.status === 'rendered' && age(o.updatedAt) > 30 * MIN) {
        await triggerRender(o.id);
      }
      // Bei Gelato: Status abfragen
      if (['submitted', 'in_production', 'shipped'].includes(o.status) && o.gelato?.id) {
        const g = await getGelatoOrder(o.gelato.id);
        await applyGelatoUpdate(o.id, g);
        if (o.status === 'submitted' && o.gelato.type === 'draft' && age(o.updatedAt) > 24 * 60 * MIN) {
          problems.push(`${o.id}: Gelato-Entwurf wartet auf Freigabe`);
        }
        if (o.status !== 'shipped' && age(o.paidAt) > 10 * 24 * 60 * MIN) {
          problems.push(`${o.id}: seit über 10 Tagen nicht versendet`);
        }
      }
      if (['render_failed', 'gelato_failed'].includes(o.status) && age(o.updatedAt) < 2 * 24 * 60 * MIN) {
        problems.push(`${o.id}: ${o.status} – ${o.lastError || ''}`.slice(0, 160));
      }
    } catch (e) {
      problems.push(`${o.id}: Abgleich-Fehler ${e.message}`);
    }
  }

  if (problems.length) {
    await notify(`Abgleich: ${problems.length} Punkt(e)`, problems.slice(0, 8).join('\n'), { priority: 'default' });
  }
  return new Response('ok');
};

export const config = { schedule: '0 6 * * *' };
