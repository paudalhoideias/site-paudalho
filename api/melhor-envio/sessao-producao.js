import { createHash, createDecipheriv } from 'node:crypto';
import { adminAllowed, configured, previewAllowed, saveTokens, tokenStatus } from '../../lib/melhor-envio/tokens.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!previewAllowed()) return res.status(404).end();
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
  if (!adminAllowed(req, res)) return;
  if (!configured()) return res.status(503).json({ error: 'Armazenamento seguro não configurado.' });
  try {
    if (req.method === 'POST') {
      // Only same-origin browser requests can migrate the existing encrypted cookie.
      // No token is accepted in a request body or returned to the browser.
      if (req.headers['x-me-migrate'] !== '1' || req.headers['sec-fetch-site'] !== 'same-origin') return res.status(403).end();
      const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('me_prod_session='));
      if (!cookie) return res.status(400).json({ error: 'Sessão de produção ausente. Use a autorização existente novamente.' });
      const raw = Buffer.from(cookie.slice('me_prod_session='.length), 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(process.env.MELHOR_ENVIO_PROD_CLIENT_SECRET).digest(), raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const session = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
      await saveTokens({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at });
      res.setHeader('Set-Cookie', 'me_prod_session=; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=0');
    }
    const status = await tokenStatus();
    return res.status(200).json({ ambiente: 'melhor_envio_producao', armazenamento_configurado: status.configured, autorizado_no_servidor: status.connected, expirado: status.expired ?? null, nova_autorizacao_necessaria: status.needs_authorization ?? !status.connected, frete_contratado: false });
  } catch {
    return res.status(503).json({ error: 'Não foi possível verificar ou persistir a autorização. Tente novamente ou refaça a autorização existente.' });
  }
}
