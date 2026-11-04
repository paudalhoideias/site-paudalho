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

const valor=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function emailClienteRecebido(pedido){
 return [
  '[SIMULAÇÃO — NÃO É UMA COMPRA REAL]',
  'Olá, '+pedido.comprador.nome+'!',
  '',
  'Recebemos seu pedido '+pedido.numero+' na Pau D’Alho.',
  'Produto: '+pedido.produto,
  'Personalização: fita '+pedido.configuracao.fita+', revestimento '+pedido.configuracao.revestimento+', lousa '+pedido.configuracao.lousa,
  'Frete: '+pedido.frete.transportadora+' / '+pedido.frete.nome+' — '+valor(pedido.valores.frete_centavos),
  'Total: '+valor(pedido.valores.total_centavos),
  '',
  'Situação: pedido registrado; pagamento Pix ainda não confirmado.',
  'A fabricação somente será autorizada após a conferência do crédito no Banco Inter.',
  'Prazo de produção: até 20 dias úteis após a confirmação, mais o prazo de transporte.',
  '',
  'Pau D’Alho — Ideias Criativas'
 ].join('\n');
}
export function emailClientePagamentoConfirmado(pedido){
 return [
  '[SIMULAÇÃO — NÃO É UM PAGAMENTO REAL]',
  'Olá, '+pedido.comprador.nome+'!',
  '',
  'O pagamento do pedido '+pedido.numero+' foi marcado como confirmado nesta simulação.',
  'Produto: '+pedido.produto,
  'Total: '+valor(pedido.valores.total_centavos),
  '',
  'Em um pedido real, após a confirmação do crédito, a produção seria autorizada e o pedido entraria na programação da oficina.',
  'Prazo de fabricação: até 20 dias úteis após a confirmação, mais prazo de transporte.',
  '',
  'ESTE É UM TESTE. Nenhuma fabricação deve ser iniciada.',
  'Pau D’Alho — Ideias Criativas'
 ].join('\n');
}
