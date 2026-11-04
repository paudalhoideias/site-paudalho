import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY = 'paudalho:me:production:tokens:v1';
const LOCK = KEY + ':lock';
export const previewAllowed = () => process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'revisao-home-etapa-1-2026-10';
export function configured() {
  return Boolean(process.env.MELHOR_ENVIO_PROD_CLIENT_ID && process.env.MELHOR_ENVIO_PROD_CLIENT_SECRET && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN && process.env.ME_ADMIN_SECRET && encryptionKey());
}
function encryptionKey() {
  const key = Buffer.from(process.env.ME_TOKEN_ENCRYPTION_KEY || '', 'base64');
  return key.length === 32 ? key : null;
}
export function adminAllowed(req, res) {
  const expected = process.env.ME_ADMIN_SECRET;
  let supplied = '';
  const authorization = req.headers.authorization || '';
  if (authorization.startsWith('Basic ')) {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString();
    if (decoded.startsWith('admin:')) supplied = decoded.slice(6);
  }
  if (expected && supplied.length && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return true;
  res.setHeader('WWW-Authenticate', 'Basic realm="Melhor Envio - administrador", charset="UTF-8"');
  res.status(401).end('Autenticação administrativa necessária.');
  return false;
}
export async function redis(...command) {
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('storage unavailable');
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(3000), redirect: 'error'
  });
  if (!response.ok) throw Error('storage unavailable');
  const data = await response.json();
  if (data.error) throw Error('storage unavailable');
  return data.result;
}
function encrypt(value) {
  const key = encryptionKey();
  if (!key) throw Error('encryption unavailable');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
function decrypt(value) {
  const raw = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
}
export function tokenData(tokens) {
  const seconds = Number(tokens.expires_in);
  if (typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token || !Number.isFinite(seconds) || seconds <= 0) throw Error('invalid tokens');
  return { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: Date.now() + Math.min(seconds, 2592000) * 1000 };
}
export async function saveTokens(tokens) {
  if (!configured()) throw Error('configuration missing');
  if (typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token || !Number.isFinite(tokens.expires_at)) throw Error('invalid tokens');
  // No TTL: retain the refresh token after access-token expiry.
  await redis('SET', KEY, encrypt(tokens));
}
export async function tokenStatus() {
  if (!configured()) return { configured: false, connected: false };
  const raw = await redis('GET', KEY);
  if (!raw) return { configured: true, connected: false };
  const tokens = decrypt(raw);
  return { configured: true, connected: !tokens.refresh_pending && Boolean(tokens.refresh_token), expired: Date.now() >= tokens.expires_at, needs_authorization: Boolean(tokens.refresh_pending) };
}
export async function accessToken(rejectedToken) {
  if (!configured()) throw Error('configuration missing');
  const raw = await redis('GET', KEY);
  if (!raw) throw Error('authorization required');
  const tokens = decrypt(raw);
  if (tokens.refresh_pending) throw Error('authorization required');
  if (tokens.expires_at > Date.now() + 120000 && tokens.access_token !== rejectedToken) return tokens.access_token;
  const owner = randomBytes(24).toString('hex');
  if (await redis('SET', LOCK, owner, 'NX', 'PX', 60000) !== 'OK') throw Error('refresh busy');
  try {
    // A different worker or a new OAuth authorization may have saved a new pair.
    const current = await redis('GET', KEY);
    if (current !== raw) return accessToken(rejectedToken);
    const pending = encrypt({ ...tokens, refresh_pending: true });
    const cas = "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 else return 0 end";
    if (await redis('EVAL', cas, 1, KEY, raw, pending) !== 1) throw Error('authorization changed');
    // Persist pending before the remote rotation. Ambiguous failures fail closed;
    // never reuse a possibly consumed refresh token automatically.
    const response = await fetch('https://melhorenvio.com.br/oauth/token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Pau DAlho (paudalhoideias@gmail.com)' },
      body: JSON.stringify({ grant_type: 'refresh_token', client_id: process.env.MELHOR_ENVIO_PROD_CLIENT_ID, client_secret: process.env.MELHOR_ENVIO_PROD_CLIENT_SECRET, refresh_token: tokens.refresh_token }),
      signal: AbortSignal.timeout(10000), redirect: 'error'
    });
    if (!response.ok) throw Error('authorization required');
    const next = tokenData(await response.json());
    if (await redis('EVAL', cas, 1, KEY, pending, encrypt(next)) !== 1) throw Error('authorization changed');
    return next.access_token;
  } finally {
    await redis('EVAL', "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, LOCK, owner).catch(() => {});
  }
}
export async function quoteAllowed() {
  // Atomic global ceiling protects the shared merchant credential on a public route.
  return await redis('EVAL', "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n", 1, KEY + ':quote-limit') <= 120;
}
