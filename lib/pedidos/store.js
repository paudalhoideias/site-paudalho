
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
 const locked=await redis('SET',PREFIX+':idempotency:'+idem,order.numero,'NX','EX',1800);
 if(locked!=='OK')return {duplicate:true,numero:await redis('GET',PREFIX+':idempotency:'+idem)};
 try{
  await redis('SET',PREFIX+':pedido:'+order.numero,encrypt(order),'EX',604800);
  await redis('LPUSH',index,order.numero);
  await redis('LTRIM',index,0,99);
  await redis('EXPIRE',index,604800);
  return {duplicate:false,numero:order.numero};
 }catch(e){
  await redis('DEL',PREFIX+':idempotency:'+idem).catch(()=>{});
  throw e;
 }
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
