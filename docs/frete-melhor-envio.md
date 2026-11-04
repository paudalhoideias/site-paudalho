# Frete real da Torre 3 em 1 — somente Preview

Branch: `revisao-home-etapa-1-2026-10`. Nenhum deploy ou alteração na main é necessário. O código retorna 404 fora desta branch Preview. A publicação de produção continua fora do escopo.

## Configuração pendente na Vercel

Este checkout não tem vínculo `.vercel`, CLI/autenticação Vercel ou variáveis de acesso ao armazenamento. Não foi possível inspecionar as configurações remotas, publicar ou executar uma cotação autenticada real daqui. Os nomes das credenciais já existentes foram preservados.

1. No projeto Vercel existente, conecte um Redis persistente com API REST compatível com Upstash (ou reutilize um já disponível). Não use memória do processo nem filesystem da função. Escolha a conexão/instância apropriada para este Preview, com acesso limitado à aplicação. Não é necessário recriar a aplicação Melhor Envio. Se não houver banco disponível, o responsável precisa provisionar/conectar um; nada foi contratado por este trabalho.
2. Em Settings → Environment Variables, restrinja **todas** as seguintes variáveis a Preview da branch acima:
   - `MELHOR_ENVIO_PROD_CLIENT_ID` e `MELHOR_ENVIO_PROD_CLIENT_SECRET`: manter os valores existentes.
   - `UPSTASH_REDIS_REST_URL`: URL HTTPS REST do Redis, sem usuário/senha na URL.
   - `UPSTASH_REDIS_REST_TOKEN`: token REST com leitura/escrita, necessário para GET, SET, EVAL, DEL, INCR e EXPIRE.
   - `ME_TOKEN_ENCRYPTION_KEY`: chave aleatória de 32 bytes codificada em base64, gerada em um gerenciador de segredos seguro. Não é a senha do banco nem o Client Secret. Mantenha backup seguro: sua perda impede descriptografar a autorização persistida.
   - `ME_ADMIN_SECRET`: senha aleatória forte para administração desta integração, também gerada e guardada no gerenciador de segredos. Não compartilhar com visitantes.
3. A configuração `vercel.json` reserva até 60 segundos apenas para as funções de cotação, callback e sessão; o armazenamento tem timeout de 3 segundos por operação e Melhor Envio, 10 segundos por requisição. Faça um novo deploy **Preview desta branch** depois de configurar as variáveis. Não publique nem faça merge na main. As variáveis não são incluídas no HTML.
4. Acesse via HTTPS o Preview, rota `/api/melhor-envio/sessao-producao`. No diálogo Basic Auth, usuário `admin`, senha `ME_ADMIN_SECRET`. O endpoint retorna somente indicadores, nunca tokens.
5. Para reaproveitar a autorização atual, use **o mesmo navegador e o mesmo domínio Preview** que guarda `me_prod_session`. Depois de autenticar na rota acima, execute no console desta página, sem copiar cookies ou tokens:

   ```js
   await fetch('/api/melhor-envio/sessao-producao', {
     method: 'POST', credentials: 'same-origin',
     headers: { 'X-Me-Migrate': '1' }
   }).then(r => r.json())
   ```

   O cookie HttpOnly é lido apenas no servidor, criptografado com a chave dedicada, persistido e removido do navegador após sucesso. Access token expirado pode ser migrado se o refresh token ainda for válido. Falhas do armazenamento não apagam o cookie. O navegador precisa enviar `Sec-Fetch-Site: same-origin`; não faça esta migração por ferramenta externa.
6. Se o cookie não existir mais, abra `/api/melhor-envio/start-producao` no Preview e autorize **a aplicação já cadastrada** novamente. O callback de produção passa a salvar diretamente no Redis. Mantém-se o redirect URI cadastrado `https://www.paudalhoideias.com.br/api/melhor-envio/callback` e a ponte já existente; ela precisa continuar encaminhando `state` e `code` para **o mesmo domínio Preview** em que o fluxo começou. Não altere main para fazer isso. Se a ponte aponta para um Preview antigo e não consegue chegar ao novo código mantendo o cookie de state, a migração do passo 5 é a alternativa; ajustar o roteamento da ponte/domínio existente fica como configuração pendente do responsável. Nunca cole o código OAuth em chats ou logs.
7. Confirme `autorizado_no_servidor: true` no status. Abra `comprar-torre-3em1.html` em uma janela anônima **sem cookie do proprietário**, informe um CEP e calcule o frete. Deve retornar `ambiente: producao` e serviços, ou lista vazia se as transportadoras não atenderem o destino. Se o Preview estiver protegido por Deployment Protection, visitantes precisarão de acesso a esse Preview: é uma configuração Vercel separada; este código não remove essa proteção.

## Persistência e renovação

O Redis guarda um único par compartilhado da loja em `paudalho:me:production:tokens:v1`, criptografado com AES-256-GCM, sem TTL. HTTPS e autenticação são obrigatórios. Nunca inspecione/imprima o valor do registro ou os headers de autenticação. Restrinja acesso ao banco, às variáveis e aos logs de infraestrutura. Não habilite captura de corpos/headers das requisições OAuth, Redis ou de callbacks na observabilidade.

A cotação pública usa somente esse registro, sem cookie ou credencial do comprador. Antes de expirar (margem de 2 minutos), renova usando `refresh_token` e persiste ambos os novos tokens e a validade. Um 401 da API dispara uma única renovação e uma única repetição da cotação. A renovação é sob demanda: não precisa cron nem proprietário conectado. Um lock Redis NX/PX de 60 segundos e compare-and-set atômico impedem renovação paralela e sobrescrita de uma autorização nova. Durante uma renovação concorrente, a consulta pode responder indisponível; o cliente pode tentar novamente.

Antes de consumir o refresh token, é salvo um marcador `refresh_pending`. Se ocorrer timeout, revogação ou falha de persistência durante a rotação, o sistema bloqueia nova tentativa automática com aquele token: a resposta pode ter sido perdida após o servidor remoto já o consumir. O status administrativo indica necessidade de nova autorização; repita a autorização da aplicação existente. Isso evita repetir uma rotação ambígua. O registro só é substituído quando a gravação é confirmada. Trocar a chave de criptografia exige reautorizar; não há rotação automática dessa chave.

Há teto global de 120 tentativas de cotação por minuto no Redis. O endpoint retorna 429 com Retry-After ao ultrapassá-lo, e falha fechado se o armazenamento estiver indisponível. Em caso de abuso, o responsável pode complementar com regras de firewall/rate limiting da Vercel.

A consulta envia origem 08790200 e **um** `package` de 65 × 45 × 16 cm, 9 kg, definidos no servidor. Não aceita peso, preço, dimensões ou quantidade do navegador. Os prazos retornados são de transporte; fabricação continua separada. Não há contratação, carrinho Melhor Envio, etiquetas ou pagamentos. O resumo de pedido continua apenas demonstrativo e os endpoints de pagamento permanecem bloqueados.

## Testes locais

Na raiz do checkout: `node --test --test-isolation=none tests/melhor-envio.test.mjs`. Os testes simulam Redis e Melhor Envio; não usam segredos reais, não contratam serviços e não demonstram conectividade ou autorização da implantação Vercel. Validam persistência criptografada, renovação, concorrência, falhas e cotação sem cookie. Não há dependências adicionais a instalar.
