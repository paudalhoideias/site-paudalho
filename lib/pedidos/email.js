// Envio transacional pelo domínio verificado. Somente no servidor.
const SENDER="Pau D'Alho <pedidos@paudalhoideias.com.br>";
export const DESTINO_LOJA='paudalhoideias@gmail.com';
export function resendConfigurado(){
 return Boolean(process.env.RESEND_API_KEY && /^re_/.test(process.env.RESEND_API_KEY));
}
export async function enviarEmail({destinatario,assunto,corpo,chaveIdempotencia}){
 if(!resendConfigurado())throw Error('Resend não configurado nesta publicação.');
 if(typeof destinatario!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario))throw Error('Destinatário inválido.');
 const headers={
  Authorization:'Bearer '+process.env.RESEND_API_KEY,
  'Content-Type':'application/json',Accept:'application/json',
  'User-Agent':'PauDAlho-Loja-Virtual/1.0'
 };
 if(chaveIdempotencia)headers['Idempotency-Key']=chaveIdempotencia;
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',headers,
  body:JSON.stringify({from:SENDER,to:[destinatario],subject:assunto,text:corpo}),
  signal:AbortSignal.timeout(10000),redirect:'error'
 });
 if(!response.ok)throw Error('Resend rejeitou o envio ('+response.status+'). Consulte os logs do Resend.');
 const data=await response.json();
 if(typeof data.id!=='string'||!data.id)throw Error('Resposta do Resend sem identificação.');
 return {id:data.id};
}
export function mensagemNovoPedido(pedido){
 const moeda=centavos=>(centavos/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 return [
  'Pau D’Alho — novo pedido '+pedido.numero,
  'Cliente: '+pedido.comprador.nome,
  'Produto: '+pedido.produto,
  'Fita: '+pedido.configuracao.fita,
  'Revestimento: '+pedido.configuracao.revestimento,
  'Lousa: '+pedido.configuracao.lousa,
  'Frete: '+pedido.frete.transportadora+' / '+pedido.frete.nome+' ('+moeda(pedido.valores.frete_centavos)+')',
  'Total: '+moeda(pedido.valores.total_centavos),
  'Pagamento: Pix aguardando conferência',
  'O pedido somente poderá seguir para fabricação após confirmação do recebimento.',
  'Consulte o painel administrativo para os dados completos.'
 ].join('\n');
}
