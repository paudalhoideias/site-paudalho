// Diagnóstico seguro da integração Mercado Pago.
// Não retorna o token nem executa cobranças.
export default function handler(req, res) {
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
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
  return res.status(200).json({
    ambiente: 'preview',
    integracao: 'Mercado Pago - Checkout Pro',
    credencial_configurada: Boolean(token),
    formato_reconhecido: token.startsWith('APP_USR-') || token.startsWith('TEST-'),
    ambiente_da_credencial: 'confirmar no painel Mercado Pago > Teste; o prefixo sozinho nao comprova o ambiente',
    pagamento_habilitado: false,
    observacao: 'Diagnostico apenas. Nenhuma order ou cobranca e criada.'
  });
}
