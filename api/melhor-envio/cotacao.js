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
  // Desabilitado até a integração OAuth e os dados de embalagem serem validados.
  if (process.env.MELHOR_ENVIO_QUOTE_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Cotação ainda não habilitada no Sandbox.' });
  }
  const { destination_cep: destination } = req.body || {};
  const origin = process.env.PAU_DALHO_ORIGIN_CEP;
  const token = process.env.MELHOR_ENVIO_SANDBOX_ACCESS_TOKEN;
  const box = packageData();
  if (!validCep(origin) || !validCep(destination)) return res.status(400).json({ error: 'CEP inválido ou origem não configurada.' });
  if (!token || !box || !process.env.MELHOR_ENVIO_CONTACT_EMAIL) return res.status(503).json({ error: 'Integração ou embalagem ainda não configurada.' });
  try {
    const api = await fetch('https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Pau DAlho (' + process.env.MELHOR_ENVIO_CONTACT_EMAIL + ')'
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
