import { randomUUID } from 'node:crypto';

// Checkout Pro via Orders API — prototipo bloqueado ate validacao comercial.
// Nao aceitar precos, fretes ou totais enviados pelo navegador.
const PRECOS = Object.freeze({ base: 33000, revestimento: 5000, lousa: 4000 });
const CORES = new Set(['azul','amarelo','preto','branco','rosa','verde','vermelho']);
const FITAS = new Set(['sem','azul','amarelo','preto','branco','rosa','verde']);
const CENTAVOS = n => (n / 100).toFixed(2);
export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex,nofollow');
  if (process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'revisao-home-etapa-1-2026-10') return res.status(404).end();
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  // Bloqueio proposital: ainda nao ha cotacao de frete real vinculada ao pedido,
  // nem taxa de cartao validada, persistencia e verificacao de webhook.
  if (process.env.MERCADO_PAGO_CHECKOUT_ENABLED !== 'true') {
    return res.status(503).json({ error:'Checkout indisponivel: faltam tarifa, frete real e conciliacao.' });
  }
  const p = req.body || {};
  if (p.quantidade !== 1 || !['sim','nao'].includes(p.lousa) ||
      !(p.revestimento === 'nao' || CORES.has(p.revestimento)) ||
      !FITAS.has(p.fita) || typeof p.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) || p.email.length > 200) {
    return res.status(400).json({ error:'Dados invalidos.' });
  }
  // Fail-closed: nao criamos cobranca com valores de frete ou cartao nao homologados.
  return res.status(503).json({
    error:'Criacao de order aguardando calculo de frete homologado e precificacao do cartao.',
    preco_pix_centavos: PRECOS.base + (p.revestimento === 'nao' ? 0 : PRECOS.revestimento) +
      (p.lousa === 'sim' ? PRECOS.lousa : 0)
  });
}
