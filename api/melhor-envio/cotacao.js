import { accessToken, previewAllowed, quoteAllowed } from '../../lib/melhor-envio/tokens.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!previewAllowed()) return res.status(404).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const destination = req.body?.destination_cep;
  if (typeof destination !== 'string' || !/^\d{5}-?\d{3}$/.test(destination)) return res.status(400).json({ error: 'Informe um CEP válido com 8 números.' });
  try {
    if (!await quoteAllowed()) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Muitas consultas. Aguarde um minuto e tente novamente.' }); }
    let token = await accessToken();
    const calculate = () => fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Pau DAlho (paudalhoideias@gmail.com)' },
      body: JSON.stringify({ from: { postal_code: '08790200' }, to: { postal_code: destination.replace('-', '') }, package: { length: 65, width: 45, height: 16, weight: 9 } }),
      signal: AbortSignal.timeout(10000), redirect: 'error'
    });
    let api = await calculate();
    if (api.status === 401) { token = await accessToken(token); api = await calculate(); }
    if (!api.ok) return res.status(502).json({ error: 'Não foi possível consultar o frete. Tente novamente mais tarde.' });
    const data = await api.json();
    if (!Array.isArray(data)) throw Error('invalid response');
    const servicos = data.filter(x => x && !x.error).flatMap(x => {
      const price = x.custom_price ?? x.price;
      const days = x.custom_delivery_time ?? x.delivery_time;
      if (!['string', 'number'].includes(typeof price) || String(price).trim() === '' || !Number.isFinite(Number(price)) || Number(price) < 0 || !['string', 'number'].includes(typeof days) || String(days).trim() === '' || !Number.isFinite(Number(days)) || Number(days) < 0) return [];
      return [{ nome: String(x.name || ''), transportadora: String(x.company?.name || ''), preco: Number(price), prazo_dias: Number(days) }];
    });
    return res.status(200).json({ ambiente: 'producao', servicos });
  } catch {
    return res.status(503).json({ error: 'Consulta de frete temporariamente indisponível. Tente novamente mais tarde.' });
  }
}
