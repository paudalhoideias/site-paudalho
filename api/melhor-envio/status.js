// Diagnóstico temporário para o ambiente de testes. Nunca revela credenciais.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const clientId = (process.env.MELHOR_ENVIO_CLIENT_ID || '').trim();
  const clientSecret = (process.env.MELHOR_ENVIO_CLIENT_SECRET || '').trim();
  return res.status(200).json({
    ambiente: 'preview',
    client_id_configurado: /^[0-9]+$/.test(clientId),
    client_secret_configurado: clientSecret.length >= 12 && !clientSecret.startsWith('sk_live_'),
    observacao: 'Verifica somente presença e formato básico; não confirma autenticação com Melhor Envio.'
  });
}
