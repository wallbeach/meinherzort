// GET /api/file?k=...&e=...&t=...  liefert Druck-/Vorschaudateien mit signierter URL aus
import { getFile } from '../lib/store.js';
import { verifyFileToken } from '../lib/util.js';

export default async (req) => {
  const u = new URL(req.url);
  const k = u.searchParams.get('k');
  if (!verifyFileToken(k, u.searchParams.get('e'), u.searchParams.get('t'))) {
    return new Response('Link ungültig oder abgelaufen', { status: 403 });
  }
  const f = await getFile(k);
  if (!f) return new Response('Nicht gefunden', { status: 404 });
  return new Response(f.data, {
    headers: {
      'content-type': f.contentType,
      'cache-control': 'private, max-age=3600',
      'content-disposition': `inline; filename="${k.split('/').pop()}"`,
    },
  });
};

export const config = { path: '/api/file' };
