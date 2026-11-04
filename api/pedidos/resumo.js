// Validacao de resumo da Torre 3 em 1. Nunca cria ou armazena pedidos.
const cores = new Set(['azul','amarelo','preto','branco','rosa','vermelho']);
const fitas = new Set(['sem','azul','amarelo','preto','branco','verde','rosa']);
export default function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='revisao-home-etapa-1-2026-10') return res.status(404).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).end();}
 const b=req.body||{};
 if(!['sim','nao'].includes(b.lousa)||!(b.revestimento==='nao'||cores.has(b.revestimento))||!(b.revestimento==='nao'?fitas.has(b.fita):b.fita===b.revestimento)||!['pix','cartao'].includes(b.metodo)) return res.status(400).json({error:'Selecao de personalizacao invalida.'});
 const preco=33000+(b.revestimento==='nao'?0:5000)+(b.lousa==='sim'?4000:0);
 return res.status(200).json({
  demonstracao:true,produto:'Torre 3 em 1',quantidade:1,
  configuracao:{fita:b.revestimento==='nao'?b.fita:b.revestimento,revestimento:b.revestimento,lousa:b.lousa},
  forma_pagamento:b.metodo,preco_produto_centavos:preco,
  frete:'Cotacao consultada separadamente; ainda nao revalidada para cobranca',
  pagamento_criado:false,pedido_registrado:false,
  prazo_producao:'Ate 20 dias uteis apos confirmacao do pagamento'
 });
}
