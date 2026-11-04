
import { randomUUID } from 'node:crypto';
import { accessToken, previewAllowed, quoteAllowed, redis, adminAllowed } from '../../lib/melhor-envio/tokens.js';
import { orderId, storeOrder, listOrders, updateTestOrderStatus } from '../../lib/pedidos/store.js';
const cores=new Set(['azul','amarelo','preto','branco','rosa','vermelho']);
const fitas=new Set(['sem','azul','amarelo','preto','branco','verde','rosa']);
const ufs=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max?s.trim():null;
function sameOrigin(req){
 const origin=req.headers.origin;
 if(!origin)return false;
 try{return new URL(origin).host===req.headers.host&&new URL(origin).protocol==='https:';}catch{return false;}
}
async function cotar(cep){
 let token=await accessToken();
 const run=()=>fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate',{
  method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json','User-Agent':'Pau DAlho (paudalhoideias@gmail.com)'},
  body:JSON.stringify({from:{postal_code:'08790200'},to:{postal_code:cep},package:{length:65,width:45,height:16,weight:9}}),
  signal:AbortSignal.timeout(10000),redirect:'error'
 });
 let response=await run();
 if(response.status===401){token=await accessToken(token);response=await run();}
 if(!response.ok)throw Error('freight unavailable');
 const data=await response.json();
 if(!Array.isArray(data))throw Error('freight unavailable');
 return data.filter(x=>x&&!x.error).flatMap(x=>{
  const price=x.custom_price??x.price,days=x.custom_delivery_time??x.delivery_time;
  if(!['string','number'].includes(typeof price)||String(price).trim()===''||!Number.isFinite(Number(price))||Number(price)<0||!Number.isFinite(Number(days))||Number(days)<0)return[];
  return [{nome:String(x.name||''),transportadora:String(x.company?.name||''),centavos:Math.round(Number(price)*100),prazo_dias:Number(days)}];
 });
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex,nofollow');
 if(!previewAllowed())return res.status(404).end();
 if(req.method==='GET'){
  if(!adminAllowed(req,res))return;
  try{const pedidos=await listOrders();return res.status(200).json({ambiente:'preview',aviso:'Pedidos de teste, sem cobrança. Registros expiram em 7 dias.',quantidade:pedidos.length,pedidos});}
  catch{return res.status(503).json({error:'Consulta de pedidos temporariamente indisponível.'});}
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end();}

 if(!sameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 if(req.body?.acao==='confirmar-pix-teste'){
  if(!adminAllowed(req,res))return;
  const numero=req.body?.numero;
  if(typeof numero!=='string')return res.status(400).json({error:'Número do pedido inválido.'});
  try{
   const updated=await updateTestOrderStatus(numero,'PAGAMENTO_CONFERIDO_TESTE');
   if(!updated.found)return res.status(404).json({error:'Pedido de teste não encontrado.'});
   return res.status(200).json({numero,ambiente:'preview',situacao:updated.order.pagamento.situacao,confirmado_em_teste:updated.order.pagamento.confirmado_em_teste,producao_liberada:false});
  }catch{return res.status(409).json({error:'Não foi possível atualizar a situação do pedido de teste.'});}
 }

 const b=req.body||{},d=b.entrega||{},p=b.comprador||{},cfg=b.configuracao||{},f=b.frete||{};
 const nome=text(p.nome,120),email=text(p.email,200),telefone=text(p.telefone,25);
 const rua=text(d.rua,150),numero=text(d.numero,15),bairro=text(d.bairro,90),cidade=text(d.cidade,90),uf=text(d.uf,2),cep=typeof d.cep==='string'?d.cep.replace(/\D/g,''):null;
 const complemento=typeof d.complemento==='string'&&d.complemento.length<=100?d.complemento.trim():null;
 const fita=text(cfg.fita,20),revestimento=text(cfg.revestimento,20),lousa=text(cfg.lousa,3);
 if(!nome||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!telefone||!rua||!numero||!bairro||!cidade||!ufs.has(uf)||!/^\d{8}$/.test(cep||'')||complemento===null||!['sim','nao'].includes(lousa)||!(revestimento==='nao'||cores.has(revestimento))||!(revestimento==='nao'?fitas.has(fita):fita===revestimento)||b.metodo!=='pix'||!text(f.nome,100)||!text(f.transportadora,100)||typeof b.idempotencia!=='string'||!/^[a-f0-9-]{36}$/i.test(b.idempotencia))
  return res.status(400).json({error:'Confira os dados do pedido e selecione Pix e frete válido.'});
 try{
  const limiter=await redis('EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",1,'paudalho:pedidos:preview:limit');
  if(limiter>15)return res.status(429).json({error:'Muitas tentativas. Tente novamente em um minuto.'});
  if(!await quoteAllowed())return res.status(429).json({error:'Consultas de frete temporariamente limitadas.'});
  const servicos=await cotar(cep);
  const selected=servicos.find(x=>x.nome===f.nome&&x.transportadora===f.transportadora);
  if(!selected||!Number.isSafeInteger(f.preco_centavos)||selected.centavos!==f.preco_centavos)return res.status(409).json({error:'O valor ou a disponibilidade do frete mudou. Calcule novamente e revise o total antes de registrar.'});
  const preco=33000+(revestimento==='nao'?0:5000)+(lousa==='sim'?4000:0);
  const pedido={
   numero:orderId(),criado_em:new Date().toISOString(),ambiente:'preview',status:'TESTE_SEM_COBRANCA',
   comprador:{nome,email,telefone},entrega:{rua,numero,complemento,bairro,cidade,uf,cep},
   produto:'Torre 3 em 1',quantidade:1,configuracao:{fita,revestimento,lousa},
   pagamento:{metodo:'pix',situacao:'NAO_INICIADO',banco:'Inter',comprovacao_manual:true},
   valores:{produto_centavos:preco,frete_centavos:selected.centavos,total_centavos:preco+selected.centavos},
   frete:{transportadora:selected.transportadora,nome:selected.nome,prazo_dias:selected.prazo_dias,contratado:false},
   prazo_producao_dias_uteis:20
  };
  const saved=await storeOrder(pedido,b.idempotencia);
  if(saved.duplicate)return res.status(409).json({error:'Esta tentativa já foi recebida. Não envie novamente.',numero:saved.numero});
  return res.status(201).json({numero:pedido.numero,ambiente:'preview',status:pedido.status,total_centavos:pedido.valores.total_centavos,frete_centavos:selected.centavos,registro_temporario:true,pagamento_iniciado:false,mensagem:'Pedido de TESTE registrado. Nenhum Pix foi gerado e nenhuma produção deve ser iniciada.'});
 }catch{
  return res.status(503).json({error:'Não foi possível registrar o pedido de teste. Nenhuma cobrança foi realizada.'});
 }
}
