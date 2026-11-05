// Checkout Pro do Mercado Pago via Orders API (fluxo recomendado).
// Integração bloqueada até credenciais de TESTE e verificação do ciclo de pagamento.
export const mercadoPagoTestStatus=()=>{
 const token=process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN||'';
 const temTeste=Boolean(token);
 const production=process.env.MERCADO_PAGO_ACCESS_TOKEN||'';
 return {
  integracao:'Checkout Pro via API de Preferências',
  ambiente:'preview',
  teste_configurado:temTeste,
  credencial_producao_presente:Boolean(production),
  checkout_habilitado:false,
  webhook_configurado:Boolean(process.env.MP_TEST_WEBHOOK_SECRET),
  webhook_validado:false,
  cobranca_real_habilitada:false
 };
};
export function bodyCheckoutProTeste(pedido){
 if(!pedido||pedido.ambiente!=='preview'||pedido.status!=='TESTE_SEM_COBRANCA')throw Error('Pedido de teste inválido');
 if(pedido.pagamento?.metodo!=='cartao')throw Error('Pagamento de teste não é cartão');
 const centavos=pedido.valores?.total_centavos;
 if(!Number.isSafeInteger(centavos)||centavos<=0)throw Error('Valor do pedido inválido');
 return {
  type:'online',
  processing_mode:'manual',
  external_reference:pedido.numero,
  total_amount:(centavos/100).toFixed(2),
  description:'Pau D’Alho — Torre 3 em 1',
  country_code:'BRA'
 };
}

export async function preferenciaCartaoTeste(pedido,origin){
 if(pedido?.ambiente!=='preview'||pedido.status!=='TESTE_SEM_COBRANCA'||pedido.pagamento?.metodo!=='cartao')throw Error('Pedido de cartão fora de teste.');
 if(!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin))throw Error('Origem de retorno inválida.');
 const token=process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN||'';
 if(!token.startsWith('APP_USR-')&&!token.startsWith('TEST-'))throw Error('Token de teste do Mercado Pago não identificado.');
 const total=pedido.valores?.total_centavos;
 if(!Number.isSafeInteger(total)||total<=0)throw Error('Total inválido.');
 const url=origin+'/comprar-torre-3em1.html';
 const payload={
  items:[{id:'torre-3em1',title:'Torre 3 em 1 Pau D’Alho — teste',quantity:1,currency_id:'BRL',unit_price:total/100,description:'Simulação de pedido, frete incluído'}],
  external_reference:pedido.numero,
  payer:{email:pedido.comprador.email},
  back_urls:{success:url,pending:url,failure:url},
  payment_methods:{excluded_payment_types:[{id:'ticket'},{id:'bank_transfer'},{id:'atm'}]},
  metadata:{ambiente:'preview',pedido:pedido.numero}
 };
 const response=await fetch('https://api.mercadopago.com/checkout/preferences',{
  method:'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json','X-Idempotency-Key':'paudalho-preview-'+pedido.numero},
  body:JSON.stringify(payload),
  signal:AbortSignal.timeout(10000),redirect:'error'
 });
 if(!response.ok)throw Error('Não foi possível gerar o checkout de testes ('+response.status+').');
 const data=await response.json();
 const link=data?.sandbox_init_point;
 if(typeof link!=='string'||!/^https:\/\/sandbox\.mercadopago\.(com|com\.br)\//i.test(link))throw Error('Mercado Pago não devolveu um link sandbox seguro.');
 return {preferencia_id:String(data.id||''),sandbox_url:link};
}

export async function consultarPagamentoTeste(id){
 if(typeof id!=='string'||!/^\d{6,22}$/.test(id))throw Error('Identificador do pagamento inválido.');
 const token=process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN||'';
 if(!token)throw Error('Credencial de teste indisponível.');
 const response=await fetch('https://api.mercadopago.com/v1/payments/'+id,{
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  signal:AbortSignal.timeout(10000),redirect:'error'
 });
 if(!response.ok)throw Error('Consulta ao Mercado Pago indisponível ('+response.status+').');
 const p=await response.json();
 if(String(p.id)!==id)throw Error('ID da consulta divergente.');
 if(p.live_mode!==false)throw Error('A consulta não corresponde a uma transação do ambiente de teste.');
 if(p.currency_id!=='BRL'||!['credit_card','debit_card'].includes(p.payment_type_id))throw Error('Pagamento não corresponde a cartão BRL.');
 if(typeof p.external_reference!=='string'||!/^TESTE-\d{8}-[A-F0-9]{10}$/.test(p.external_reference))throw Error('Pagamento sem pedido de teste relacionado.');
 if(!Number.isFinite(p.transaction_amount))throw Error('Valor do pagamento inválido.');
 return {
  id:String(p.id),pedido:p.external_reference,status:String(p.status||''),
  valor_centavos:Math.round(p.transaction_amount*100),
  moeda:p.currency_id,ambiente:'sandbox'
 };
}
