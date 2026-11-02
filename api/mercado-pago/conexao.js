// Verificacao somente leitura da credencial da aplicacao no Mercado Pago.
// Nunca devolve o Access Token, dados da conta ou a resposta bruta da API.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'revisao-home-etapa-1-2026-10') {
    return res.status(404).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ conexao: 'nao_configurada', cobrancas_criadas: false });
  try {
    // Consulta de leitura: nao cria orders, pagamentos nem preferencias.
    const upstream = await fetch('https://api.mercadopago.com/users/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    const ok = upstream.ok;
    return res.status(ok ? 200 : 502).json({
      ambiente: 'preview',
      conexao: ok ? 'autenticacao_aceita' : 'nao_confirmada',
      api_status: upstream.status,
      cobrancas_criadas: false,
      observacao: ok ? 'API respondeu com sucesso a consulta de leitura.' :
        'A API nao aceitou a consulta. Nao foi criada nenhuma cobranca.'
    });
  } catch {
    return res.status(502).json({
      ambiente: 'preview', conexao: 'falha_comunicacao', cobrancas_criadas: false
    });
  }
}
