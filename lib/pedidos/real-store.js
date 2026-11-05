// Preparação isolada do cadastro durável de pedidos reais.
// Este arquivo não é usado pelo checkout de teste.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { redis } from '../melhor-envio/tokens.js';
const ROOT='paudalho:pedidos:reais:v1';
function key(){const raw=Buffer.from(process.env.ME_TOKEN_ENCRYPTION_KEY||'','base64');if(raw.length!==32)throw Error('Chave de armazenamento indisponível');return Buffer.from(hkdfSync('sha256',raw,Buffer.from('paudalho-reais-v1'),Buffer.from('dados-pedidos'),32));}
function encrypt(obj){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);const buf=Buffer.concat([c.update(JSON.stringify(obj),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),buf]).toString('base64url');}
function decrypt(text){const buf=Buffer.from(text,'base64url'),d=createDecipheriv('aes-256-gcm',key(),buf.subarray(0,12));d.setAuthTag(buf.subarray(12,28));return JSON.parse(Buffer.concat([d.update(buf.subarray(28)),d.final()]).toString('utf8'));}
export const newRealOrderId=()=> 'PD-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+randomBytes(5).toString('hex').toUpperCase();
export async function saveRealOrder(order,idempotencia){
 if(!/^PD-\d{8}-[A-F0-9]{10}$/.test(order?.numero||'')||order.ambiente!=='production'||order.status!=='AGUARDANDO_PAGAMENTO'||order.pagamento?.situacao!=='AGUARDANDO_PIX'||!Number.isSafeInteger(order.valores?.total_centavos)||order.valores.total_centavos<=0)throw Error('Pedido real inválido');
 if(typeof idempotencia!=='string'||!/^[a-f0-9-]{36}$/i.test(idempotencia))throw Error('Idempotência inválida');
 const script="local prev=redis.call('GET',KEYS[1]); if prev then return {0,prev} end; if redis.call('EXISTS',KEYS[2])==1 then return {-1,'collision'} end; redis.call('SET',KEYS[2],ARGV[2]); redis.call('SET',KEYS[1],ARGV[1]); redis.call('LPUSH',KEYS[3],ARGV[1]); return {1,ARGV[1]}";
 const ret=await redis('EVAL',script,3,ROOT+':idem:'+idempotencia,ROOT+':pedido:'+order.numero,ROOT+':indice',order.numero,encrypt(order));
 if(!Array.isArray(ret)||ret[0]===-1)throw Error('Falha no registro ou colisão de pedido');
 return {created:ret[0]===1,numero:ret[1]};
}
export async function readRealOrder(numero){if(!/^PD-\d{8}-[A-F0-9]{10}$/.test(numero||''))throw Error('Número inválido');const raw=await redis('GET',ROOT+':pedido:'+numero);return raw?decrypt(raw):null;}
export async function listRealOrders(){const ids=await redis('LRANGE',ROOT+':indice',0,99);const pedidos=[];for(const id of ids||[]){const p=await readRealOrder(id);if(p)pedidos.push(p)}return pedidos;}
// Sem TTL: os pedidos não expiram automaticamente. Política de retenção ainda deverá ser definida.
export async function confirmRealPix(numero,conferente){
 if(!/^PD-\d{8}-[A-F0-9]{10}$/.test(numero||'')||typeof conferente!=='string'||!conferente.trim())throw Error('Dados de confirmação inválidos');
 for(let tentativa=0;tentativa<3;tentativa++){
  const raw=await redis('GET',ROOT+':pedido:'+numero);
  if(!raw)return {found:false};
  const order=decrypt(raw);
  if(order.ambiente!=='production')throw Error('Ambiente inválido');
  if(order.status==='PRODUCAO_AUTORIZADA')return {found:true,unchanged:true,order};
  if(order.status!=='AGUARDANDO_PAGAMENTO'||order.pagamento?.situacao!=='AGUARDANDO_PIX')throw Error('Transição inválida');
  const next={...order,status:'PRODUCAO_AUTORIZADA',pagamento:{...order.pagamento,situacao:'PIX_CONFIRMADO',conferido_em:new Date().toISOString(),conferido_por:conferente.trim().slice(0,120)}};
  const script="if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 else return 0 end";
  if(await redis('EVAL',script,1,ROOT+':pedido:'+numero,raw,encrypt(next))===1)return {found:true,unchanged:false,order:next};
 }
 throw Error('Pedido alterado simultaneamente');
}
