import { createHmac, timingSafeEqual } from 'node:crypto';
function validState(value, cookie, secret) {
  if (!value || !cookie || !secret || value !== cookie) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const time = Number(parts[0]);
  if (!Number.isFinite(time) || Date.now() - time > 600000 || time > Date.now() + 30000) return false;
  const signed = parts[0] + '.' + parts[1];
  const expected = createHmac('sha256', secret).update(signed).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(parts[2]);
  return a.length === b.length && timingSafeEqual(a, b);
}
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).end();
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  res.setHeader('Set-Cookie', 'me_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=0');
  if (process.env.MELHOR_ENVIO_OAUTH_ENABLED !== 'true') return res.status(503).end('Autorização em preparação.');
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=').map(decodeURIComponent)).filter(x => x.length === 2));
  if (!validState(req.query.state, cookies.me_oauth_state, process.env.MELHOR_ENVIO_CLIENT_SECRET)) return res.status(403).end('Autorização não reconhecida ou expirada.');
  if (req.query.error) return res.status(400).end('Autorização recusada.');
  if (typeof req.query.code !== 'string' || !req.query.code) return res.status(400).end('Código de autorização ausente.');
  // Não trocar código por token até existir armazenamento persistente e seguro de credenciais.
  return res.status(503).end('Código recebido e validado. Troca de token ainda não habilitada.');
}
