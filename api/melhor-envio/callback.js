import { configured, saveTokens, tokenData } from '../../lib/melhor-envio/tokens.js';
import { createHmac, timingSafeEqual, createHash, createCipheriv, randomBytes } from 'node:crypto';
function validState(value, cookie, secret) {
  if (!value || !cookie || !secret || value !== cookie) return false;
  const parts = value.split('.');
  const isProd = parts[0] === 'prod';
  if (parts.length !== (isProd ? 4 : 3)) return false;
  const time = Number(parts[isProd ? 1 : 0]);
  if (!Number.isFinite(time) || Date.now() - time > 600000 || time > Date.now() + 30000) return false;
  const signed = parts.slice(0,-1).join('.');
  const expected = createHmac('sha256', secret).update(signed).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(parts[parts.length-1]);
  return a.length === b.length && timingSafeEqual(a, b);
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'revisao-home-etapa-1-2026-10') return res.status(404).end();
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const prod = typeof req.query.state === 'string' && req.query.state.startsWith('prod.');
  const stateCookie = prod ? 'me_prod_oauth_state' : 'me_oauth_state';
  const secret = prod ? process.env.MELHOR_ENVIO_PROD_CLIENT_SECRET : process.env.MELHOR_ENVIO_CLIENT_SECRET;
  const id = prod ? process.env.MELHOR_ENVIO_PROD_CLIENT_ID : process.env.MELHOR_ENVIO_CLIENT_ID;
  res.setHeader('Set-Cookie', stateCookie + '=; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=0');
  let cookies;
  try { cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=').map(decodeURIComponent)).filter(x => x.length === 2)); } catch { return res.status(403).end('Autorização inválida.'); }
  if (!validState(req.query.state, cookies[stateCookie], secret)) return res.status(403).end('Autorização não reconhecida ou expirada.');
  if (req.query.error) return res.status(400).end('Autorização recusada.');
  if (typeof req.query.code !== 'string' || !req.query.code) return res.status(400).end('Código de autorização ausente.');
  if (prod && !configured()) return res.status(503).end('Armazenamento seguro não configurado.');
  if (!id || !secret) return res.status(503).end('Credenciais não configuradas.');
  try {
    const tokenResponse = await fetch(prod ? 'https://melhorenvio.com.br/oauth/token' : 'https://sandbox.melhorenvio.com.br/oauth/token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: id, client_secret: secret,
        redirect_uri: 'https://www.paudalhoideias.com.br/api/melhor-envio/callback',
        code: req.query.code
      }),
      signal: AbortSignal.timeout(10000), redirect: 'error'
    });
    if (!tokenResponse.ok) return res.status(502).end('A autorização foi reconhecida, mas o serviço recusou a troca do código.');
    const tokens = await tokenResponse.json();
    if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') {
      return res.status(502).end('Resposta de token incompleta.');
    }
    if (prod) {
      await saveTokens(tokenData(tokens));
      res.setHeader('Set-Cookie', [stateCookie + '=; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=0', 'me_prod_session=; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=0']);
      return res.status(200).end('Melhor Envio conectado ao servidor. Consulta disponível sem sessão do proprietário.');
    }
    const key = createHash('sha256').update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const packed = Buffer.concat([cipher.update(JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + Math.min(Number(tokens.expires_in || 3600), 2592000) * 1000
    }), 'utf8'), cipher.final()]);
    const value = Buffer.concat([iv, cipher.getAuthTag(), packed]).toString('base64url');
    if (value.length > 3700) return res.status(503).end('Sessão excede limite de teste.');
    res.setHeader('Set-Cookie', (prod ? 'me_prod_session=' : 'me_sandbox_session=') + value + '; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=86400');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Melhor Envio conectado</title><p>Autorização de consulta concluída neste navegador. Nenhuma compra ou etiqueta foi gerada.</p></html>');
  } catch {
    return res.status(502).end('Não foi possível concluir a autorização e salvar a conexão. Tente novamente pela aplicação existente.');
  }
}
