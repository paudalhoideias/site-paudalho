import { createHmac, timingSafeEqual, createHash, createCipheriv, randomBytes } from 'node:crypto';
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
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'revisao-home-etapa-1-2026-10') return res.status(404).end();
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  res.setHeader('Set-Cookie', 'me_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=0');
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=').map(decodeURIComponent)).filter(x => x.length === 2));
  if (!validState(req.query.state, cookies.me_oauth_state, process.env.MELHOR_ENVIO_CLIENT_SECRET)) return res.status(403).end('Autorização não reconhecida ou expirada.');
  if (req.query.error) return res.status(400).end('Autorização recusada.');
  if (typeof req.query.code !== 'string' || !req.query.code) return res.status(400).end('Código de autorização ausente.');
  // Sessão criptografada apenas para testes neste navegador. Não é armazenamento
  // persistente adequado para o checkout de uma loja.
  const secret = process.env.MELHOR_ENVIO_CLIENT_SECRET;
  const id = process.env.MELHOR_ENVIO_CLIENT_ID;
  if (!id || !secret) return res.status(503).end('Credenciais não configuradas.');
  try {
    const tokenResponse = await fetch('https://sandbox.melhorenvio.com.br/oauth/token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: id, client_secret: secret,
        redirect_uri: 'https://www.paudalhoideias.com.br/api/melhor-envio/callback',
        code: req.query.code
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!tokenResponse.ok) return res.status(502).end('A autorização foi reconhecida, mas o Sandbox recusou a troca do código.');
    const tokens = await tokenResponse.json();
    if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') {
      return res.status(502).end('Resposta de token incompleta.');
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
    res.setHeader('Set-Cookie', 'me_sandbox_session=' + value + '; HttpOnly; Secure; SameSite=Lax; Path=/api/melhor-envio; Max-Age=86400');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Melhor Envio conectado</title><p>Autorização de testes concluída neste navegador. Nenhuma compra ou etiqueta foi gerada.</p></html>');
  } catch {
    return res.status(502).end('Erro de comunicação ao solicitar token de teste.');
  }
}
