
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { redis } from '../melhor-envio/tokens.js';
const PREFIX='paudalho:pedidos:preview:v1';
const index=PREFIX+':index';
function key(){
 const secret=Buffer.from(process.env.ME_TOKEN_ENCRYPTION_KEY||'','base64');
 if(secret.length!==32)throw Error('encryption unavailable');
 return Buffer.from(hkdfSync('sha256',secret,Buffer.from('paudalho-pedidos-preview-v1'),Buffer.from('pedido-dados-pessoais'),32));
}
function encrypt(value){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
}
function decrypt(text){
 const raw=Buffer.from(text,'base64url'),decipher=createDecipheriv('aes-256-gcm',key(),raw.subarray(0,12));
 decipher.setAuthTag(raw.subarray(12,28));
 return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8'));
}
export const orderId=()=> 'TESTE-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+randomBytes(5).toString('hex').toUpperCase();
export async function storeOrder(order,idem){
 if(!/^TESTE-\d{8}-[A-F0-9]{10}$/.test(order?.numero||'')||order.ambiente!=='preview'||order.status!=='TESTE_SEM_COBRANCA'||!['pix','cartao'].includes(order.pagamento?.metodo)||typeof idem!=='string'||!/^[a-f0-9-]{36}$/i.test(idem))throw Error('invalid test order');
 // Registro + idempotência + índice em uma operação atômica no Redis.
 // Mantém a expiração de sete dias, apenas para pedidos fictícios.
 const script="local old=redis.call('GET',KEYS[1]); if old then return {0,old} end; if redis.call('EXISTS',KEYS[2])==1 then return {-1,'collision'} end; redis.call('SET',KEYS[2],ARGV[2],'EX',604800); redis.call('SET',KEYS[1],ARGV[1],'EX',604800); redis.call('LPUSH',KEYS[3],ARGV[1]); redis.call('LTRIM',KEYS[3],0,99); redis.call('EXPIRE',KEYS[3],604800); return {1,ARGV[1]}";
 const ret=await redis('EVAL',script,3,PREFIX+':idempotency:'+idem,PREFIX+':pedido:'+order.numero,index,order.numero,encrypt(order));
 if(!Array.isArray(ret)||ret[0]===-1)throw Error('order registration failed');
 return {duplicate:ret[0]===0,numero:ret[1]};
}
export async function getTestOrder(numero){
 if(typeof numero!=='string'||!/^TESTE-\d{8}-[A-F0-9]{10}$/.test(numero))return null;
 const raw=await redis('GET',PREFIX+':pedido:'+numero);
 return raw?decrypt(raw):null;
}
export async function listOrders(){
 const ids=await redis('LRANGE',index,0,49);
 const pedidos=[];
 for(const id of ids||[]){
  const raw=await redis('GET',PREFIX+':pedido:'+id);
  if(raw)pedidos.push(decrypt(raw));
 }
 return pedidos;
}

export async function updateTestOrderStatus(numero, situacao){
 if(!/^TESTE-\d{8}-[A-F0-9]{10}$/.test(numero)||!['PAGAMENTO_CONFERIDO_TESTE','AGUARDANDO_CONFERENCIA_TESTE'].includes(situacao))throw Error('invalid state');
 const redisKey=PREFIX+':pedido:'+numero;
 const raw=await redis('GET',redisKey);
 if(!raw) return {found:false};
 const order=decrypt(raw);
 if(order.ambiente!=='preview'||order.status!=='TESTE_SEM_COBRANCA') throw Error('invalid order');
 if(order.pagamento?.metodo!=='pix')throw Error('Pix não aplicável a pedido de cartão');
 const oldStatus=order.pagamento?.situacao;
 if(oldStatus===situacao) return {found:true,unchanged:true,order};
 if(oldStatus==='PAGAMENTO_CONFERIDO_TESTE'&&situacao==='AGUARDANDO_CONFERENCIA_TESTE')throw Error('invalid transition');
 const agora=new Date().toISOString();
 order.pagamento={...order.pagamento,situacao,confirmado_em_teste:situacao==='PAGAMENTO_CONFERIDO_TESTE'?agora:null};
 order.historico=[...(Array.isArray(order.historico)?order.historico:[]),{em:agora,evento:'CONFERENCIA_PIX_SIMULADA',descricao:'Pagamento marcado como conferido somente para testes; produção não autorizada.'}];
 const script="if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',604800); return 1 else return 0 end";
 const ok=await redis('EVAL',script,1,redisKey,raw,encrypt(order));
 if(ok!==1)throw Error('conflicting update');
 return {found:true,unchanged:false,order};
}

export async function registrarPagamentoCartaoTeste(pagamento){
 if(!pagamento||typeof pagamento.pedido!=='string'||!/^TESTE-\d{8}-[A-F0-9]{10}$/.test(pagamento.pedido)||typeof pagamento.id!=='string')throw Error('Pagamento de teste inválido.');
 const redisKey=PREFIX+':pedido:'+pagamento.pedido;
 for(let tentativa=0;tentativa<3;tentativa++){
  const raw=await redis('GET',redisKey);
  if(!raw)return {found:false};
  const order=decrypt(raw);
  if(order.ambiente!=='preview'||order.status!=='TESTE_SEM_COBRANCA'||order.pagamento?.metodo!=='cartao')throw Error('O pedido não corresponde a cartão sandbox.');
  if(order.valores.total_centavos!==pagamento.valor_centavos)throw Error('Valor do Mercado Pago diferente do pedido.');
  if(order.pagamento?.mp_payment_id && order.pagamento.mp_payment_id!==pagamento.id)throw Error('Já existe outro pagamento vinculado a este pedido.');
  const map={approved:'CARTAO_APROVADO_TESTE',rejected:'CARTAO_RECUSADO_TESTE',pending:'CARTAO_PENDENTE_TESTE',in_process:'CARTAO_PENDENTE_TESTE',cancelled:'CARTAO_CANCELADO_TESTE',refunded:'CARTAO_ESTORNADO_TESTE',charged_back:'CARTAO_CONTESTADO_TESTE'};
  const situacao=map[pagamento.status];
  if(!situacao)throw Error('Status de pagamento não reconhecido.');
  const atual=order.pagamento?.situacao;
  if(atual===situacao&&order.pagamento.mp_payment_id===pagamento.id)return {found:true,unchanged:true,order};
  const agora=new Date().toISOString();
  const atualizado={...order,pagamento:{...order.pagamento,situacao,mp_payment_id:pagamento.id,mp_status:pagamento.status,verificado_em:agora},historico:[...(order.historico||[]),{em:agora,evento:'MERCADO_PAGO_SANDBOX_'+pagamento.status.toUpperCase(),descricao:'Resultado verificado na API do Mercado Pago (simulação). Produção não autorizada.'}]};
  const script="if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',604800); return 1 else return 0 end";
  if(await redis('EVAL',script,1,redisKey,raw,encrypt(atualizado))===1)return {found:true,unchanged:false,order:atualizado};
 }
 throw Error('Atualização simultânea do pedido; tente novamente.');
}
