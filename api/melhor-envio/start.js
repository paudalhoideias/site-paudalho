import { randomBytes, createHmac } from 'node:crypto';
const host = 'https://site-paudalho-git-r-6037e1-fabricio-oliveiras-projects-d0e317d9.vercel.app';
const callback = 'https://www.paudalhoideias.com.br/api/melhor-envio/callback';
function sign(value, key) { return createHmac('sha256', key).update(value).digest('hex'); }
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'revisao-home-etapa-1-2026-10') return res.status(404).end();
  if (req.method !== 'GET') return res.status(405).end();
  const id = process.env.MELHOR_ENVIO_CLIENT_ID;
  const secret = process.env.MELHOR_ENVIO_CLIENT_SECRET;
  if (!id || !secret) return res.status(503).end();
  const nonce = randomBytes(24).toString('hex');
  const payload = String(Date.now()) + '.' + nonce;
  const state = payload + '.' + sign(payload, secret);
  res.setHeader('Set-Cookie', 'me_oauth_state=' + encodeURIComponent(state) + '; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=600');
  const url = new URL('https://sandbox.melhorenvio.com.br/oauth/authorize');
  url.searchParams.set('client_id', id);
  url.searchParams.set('redirect_uri', callback);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'shipping-calculate');
  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  return res.end();
}
