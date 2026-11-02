// Pedido por e-mail: bloqueado ate ativacao explicita e frete real validado.
// Nao registra uma venda, nao aceita valores do navegador e nao aciona pagamentos.
const CORES=new Set(['azul','amarelo','preto','branco','rosa','verde','vermelho']);
const FITAS=new Set(['sem','azul','amarelo','preto','branco','verde','rosa']);
const safe=(v,max=200)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&![<>]/.test(v);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Robots-Tag','noindex,nofollow');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='revisao-home-etapa-1-2026-10')return res.status(404).end();
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).end();}
 // Nao habilitar enquanto o frete ainda vier de Sandbox e nao houver
 // protecao anti-spam e conciliacao de recebimentos.
 if(process.env.PEDIDOS_EMAIL_ENABLED!=='true')return res.status(503).json({error:'Envio de pedidos ainda em preparacao. Nenhum pedido foi registrado.'});
 const p=req.body||{};
 if(!safe(p.nome,120)||!safe(p.email,200)||!safe(p.telefone,25)||!safe(p.endereco,250)||
 !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)||!['pix','cartao'].includes(p.metodo)||
 !['sim','nao'].includes(p.lousa)||!(p.revestimento==='nao'||CORES.has(p.revestimento))||
 !FITAS.has(p.fita)||p.quantidade!==1||!/^[0-9]{8}$/.test(p.cep||''))return res.status(400).json({error:'Verifique os campos do pedido.'});
 // Nunca aceitar frete, total, servico ou status de pagamento do navegador.
 // Proxima implementacao: cotar no servidor com credencial de producao,
 // associar identificador de cotacao e realizar deduplicacao persistente.
 return res.status(503).json({error:'Frete real e armazenamento de pedidos ainda nao homologados. Nenhum e-mail foi enviado.'});
}
