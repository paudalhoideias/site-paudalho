import { createHash, createDecipheriv } from 'node:crypto';
// Cotação experimental: jamais disponível em produção.
// Dimensões e peso são definidos no servidor, não pelo comprador.
// Requer token OAuth de Sandbox válido em variável protegida.
const validCep = value => typeof value === 'string' && /^[0-9]{8}$/.test(value.replace(/-/g, ''));
const normalize = value => value.replace(/-/g, '');
function packageData() {
  // Torre 3 em 1: embalagem fechada, um único volume.
  return { length: 65, width: 45, height: 16, weight: 9 };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'revisao-home-etapa-1-2026-10') return res.status(404).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const { destination_cep: destination } = req.body || {};
  const origin = '08790200';
  let token;
  try {
    const session = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('me_sandbox_session='));
    if (!session) return res.status(401).json({ error: 'Abra a autorização do Sandbox neste navegador antes de cotar.' });
    const raw = Buffer.from(session.slice('me_sandbox_session='.length), 'base64url');
    if (raw.length < 29) throw new Error('invalid session');
    const key = createHash('sha256').update(process.env.MELHOR_ENVIO_CLIENT_SECRET || '').digest();
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const sessionData = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    if (Date.now() >= Number(sessionData.expires_at)) return res.status(401).json({ error: 'Sessão expirada, autorize novamente no Sandbox.' });
    token = sessionData.access_token;
  } catch { return res.status(401).json({ error: 'Sessão de autenticação inválida.' }); }
  const box = packageData();
  if (!validCep(origin) || !validCep(destination)) return res.status(400).json({ error: 'CEP inválido ou origem não configurada.' });
  if (!token || !box) return res.status(503).json({ error: 'Integração ou embalagem ainda não configurada.' });
  try {
    const api = await fetch('https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Pau DAlho (paudalhoideias@gmail.com)'
      },
      body: JSON.stringify({
        from: { postal_code: normalize(origin) },
        to: { postal_code: normalize(destination) },
        package: box
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!api.ok) return res.status(502).json({ error: 'Não foi possível cotar o frete de teste.', upstream_status: api.status });
    const data = await api.json();
    if (!Array.isArray(data)) return res.status(502).json({ error: 'Resposta inesperada do serviço de frete.' });
    return res.status(200).json({ ambiente: 'sandbox', servicos: data.filter(x => x && !x.error).map(x => ({
      nome: String(x.name || ''), transportadora: String(x.company?.name || ''),
      preco: x.custom_price || x.price || null, prazo_dias: x.custom_delivery_time || x.delivery_time || null
    })) });
  } catch (_) { return res.status(502).json({ error: 'Falha de comunicação com o serviço de frete.' }); }
}
