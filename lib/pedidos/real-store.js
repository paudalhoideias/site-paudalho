// Preparação isolada do cadastro durável de pedidos reais.
// Este arquivo não é usado pelo checkout de teste.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { redis } from '../melhor-envio/tokens.js';
const ROOT='paudalho:pedidos:reais:v1';
function key(){const raw=Buffer.from(process.env.ME_TOKEN_ENCRYPTION_KEY||'','base64');if(raw.length!==32)throw Error('Chave de armazenamento indisponível');return Buffer.from(hkdfSync('sha256',raw,Buffer.from('paudalho-reais-v1'),Buffer.from('dados-pedidos'),32));}
function encrypt(obj){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);const buf=Buffer.concat([c.update(JSON.stringify(obj),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),buf]).toString('base64url');}
function decrypt(text){const buf=Buffer.from(text,'base64url'),d=createDecipheriv('aes-256-gcm',key(),buf.subarray(0,12));d.setAuthTag(buf.subarray(12,28));return JSON.parse(Buffer.concat([d.update(buf.subarray(28)),d.final()]).toString('utf8'));}
export const newRealOrderId=()=> 'PD-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+randomBytes(5).toString('hex').toUpperCase();
export async function saveRealOrder(order){
 if(!/^PD-\d{8}-[A-F0-9]{10}$/.test(order?.numero||'')||order.ambiente!=='production'||order.status!=='AGUARDANDO_PAGAMENTO')throw Error('Pedido real inválido');
 const result=await redis('SET',ROOT+':pedido:'+order.numero,encrypt(order),'NX');
 if(result!=='OK')throw Error('Número de pedido duplicado');
 await redis('LPUSH',ROOT+':indice',order.numero);
 return order.numero;
}
export async function readRealOrder(numero){if(!/^PD-\d{8}-[A-F0-9]{10}$/.test(numero||''))throw Error('Número inválido');const raw=await redis('GET',ROOT+':pedido:'+numero);return raw?decrypt(raw):null;}
export async function listRealOrders(){const ids=await redis('LRANGE',ROOT+':indice',0,99);const pedidos=[];for(const id of ids||[]){const p=await readRealOrder(id);if(p)pedidos.push(p)}return pedidos;}
// Sem TTL: os pedidos não expiram automaticamente. Política de retenção ainda deverá ser definida.