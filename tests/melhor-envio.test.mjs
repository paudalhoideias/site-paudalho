import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { accessToken, saveTokens, tokenStatus } from '../lib/melhor-envio/tokens.js';
import quote from '../api/melhor-envio/cotacao.js';
import session from '../api/melhor-envio/sessao-producao.js';
import callback from '../api/melhor-envio/callback.js';
import start from '../api/melhor-envio/start-producao.js';

const originalFetch = globalThis.fetch, originalEnv = { ...process.env };
let store, requests, oauth, calculate, failSave, rate;
const TOKEN_KEY = 'paudalho:me:production:tokens:v1';
function response(status, data) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
function res() { return { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k] = v; }, status(n) { this.statusCode=n;return this; }, end(body) { this.body=body;return this; }, json(body) { this.body=body;return this; } }; }
function req(method='POST', body={ destination_cep: '01001-000' }) { return { method, body, headers: {}, query: {} }; }
function admin(r) { r.headers.authorization='Basic '+Buffer.from('admin:test-admin').toString('base64');return r; }
function legacyCookie() {
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',createHash('sha256').update('test-secret').digest(),iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({ access_token:'legacy-access',refresh_token:'legacy-refresh',expires_at:Date.now()-1000 })),cipher.final()]);
 return 'me_prod_session='+Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
beforeEach(() => {
 Object.assign(process.env, { VERCEL_ENV:'preview', VERCEL_GIT_COMMIT_REF:'revisao-home-etapa-1-2026-10', MELHOR_ENVIO_PROD_CLIENT_ID:'123', MELHOR_ENVIO_PROD_CLIENT_SECRET:'test-secret', UPSTASH_REDIS_REST_URL:'https://redis.example.test', UPSTASH_REDIS_REST_TOKEN:'test-redis', ME_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'), ME_ADMIN_SECRET:'test-admin' });
 store=new Map();requests=[];failSave=false;rate=0;
 oauth=async()=>response(200,{access_token:'new-access',refresh_token:'new-refresh',expires_in:3600});
 calculate=async()=>response(200,[{name:'PAC',company:{name:'Correios'},price:'42.50',delivery_time:5}]);
 globalThis.fetch=async(url,options)=>{
  if (String(url).startsWith('https://redis.example.test')) {
   const [cmd,...args]=JSON.parse(options.body);
   let result;
   if(cmd==='GET') result=store.get(args[0])??null;
   else if(cmd==='SET') {
    if(failSave && args[0]===TOKEN_KEY) throw Error('private storage details');
    if(args.includes('NX')&&store.has(args[0])) result=null;
    else { store.set(args[0],args[1]);result='OK'; }
   } else if(cmd==='EVAL') {
    const [script,,key,...argv]=args;
    if(script.includes('INCR')) result=++rate;
    else if(store.get(key)===argv[0]) {
     if(script.includes("redis.call('SET'")) { if(failSave) throw Error('private storage details');store.set(key,argv[1]); }
     else store.delete(key);
     result=1;
    } else result=0;
   } else throw Error('Unexpected Redis command');
   return response(200,{result});
  }
  requests.push({url:String(url),...options});
  if(String(url)==='https://melhorenvio.com.br/oauth/token') return oauth(options);
  assert.equal(String(url),'https://melhorenvio.com.br/api/v2/me/shipment/calculate');
  return calculate(options);
 };
});
afterEach(()=>{globalThis.fetch=originalFetch;process.env={...originalEnv};});
const fresh=()=>saveTokens({access_token:'old-access',refresh_token:'old-refresh',expires_at:Date.now()+3600000});
const expired=()=>saveTokens({access_token:'old-access',refresh_token:'old-refresh',expires_at:Date.now()-1000});

test('encrypted durable storage, no TTL, no browser session needed',async()=>{
 await fresh();assert.ok(store.get(TOKEN_KEY));assert.ok(!store.get(TOKEN_KEY).includes('old-access'));assert.ok(!store.get(TOKEN_KEY).includes('old-refresh'));
 assert.equal(await accessToken(),'old-access');assert.equal((await tokenStatus()).connected,true);
 const r=res();await quote(req(),r);assert.equal(r.statusCode,200);assert.equal(r.body.ambiente,'producao');assert.equal(r.body.servicos[0].preco,42.5);
 const payload=JSON.parse(requests[0].body);assert.deepEqual(payload,{from:{postal_code:'08790200'},to:{postal_code:'01001000'},package:{length:65,width:45,height:16,weight:9}});
 assert.ok(!JSON.stringify(r).includes('old-access'));
});
test('refresh persists the rotated pair and subsequent requests reuse it',async()=>{
 await expired();assert.equal(await accessToken(),'new-access');assert.equal(await accessToken(),'new-access');assert.equal(requests.length,1);
 assert.equal(JSON.parse(requests[0].body).grant_type,'refresh_token');assert.equal(JSON.parse(requests[0].body).refresh_token,'old-refresh');
 assert.equal((await tokenStatus()).connected,true);
});
test('only one worker rotates a token during concurrent requests',async()=>{
 await expired();let release;const gate=new Promise(resolve=>{release=resolve;});let arrived;const entered=new Promise(resolve=>{arrived=resolve;});
 oauth=async()=>{arrived();await gate;return response(200,{access_token:'rotated',refresh_token:'rotated-refresh',expires_in:3600});};
 const first=accessToken();await entered;await assert.rejects(accessToken());release();assert.equal(await first,'rotated');assert.equal(requests.length,1);
});
test('ambiguous refresh failures do not retry a potentially consumed token',async()=>{
 await expired();oauth=async()=>{throw Error('secret-provider-response');};
 await assert.rejects(accessToken());await assert.rejects(accessToken());assert.equal(requests.length,1);assert.equal((await tokenStatus()).needs_authorization,true);
 const r=res();await quote(req(),r);assert.equal(r.statusCode,503);assert.ok(!JSON.stringify(r).includes('secret-provider-response'));
});
test('revoked refresh token requires new authorization without leaking response',async()=>{
 await expired();oauth=async()=>response(400,{error:'private error with token'});
 await assert.rejects(accessToken());assert.equal((await tokenStatus()).needs_authorization,true);
});
test('failed persistence after rotation leaves the record blocked',async()=>{
 await expired();oauth=async()=>{failSave=true;return response(200,{access_token:'new',refresh_token:'new-refresh',expires_in:3600});};
 await assert.rejects(accessToken());failSave=false;assert.equal((await tokenStatus()).needs_authorization,true);await assert.rejects(accessToken());assert.equal(requests.length,1);
});
test('new OAuth authorization cannot be overwritten by a stale refresh',async()=>{
 await expired();oauth=async()=>{await saveTokens({access_token:'owner-new',refresh_token:'owner-refresh',expires_at:Date.now()+3600000});return response(200,{access_token:'stale',refresh_token:'stale-refresh',expires_in:3600});};
 await assert.rejects(accessToken());assert.equal(await accessToken(),'owner-new');
});
test('401 retries once with a renewed token; no other upstream operations',async()=>{
 await fresh();let calls=0;calculate=async()=>response(++calls===1?401:200,[]);
 const r=res();await quote(req(),r);assert.equal(r.statusCode,200);assert.equal(calls,2);assert.equal(requests.length,3);
 assert.equal(requests[2].headers.Authorization,'Bearer new-access');
});
test('second 401 fails without looping or exposing upstream body',async()=>{
 await fresh();calculate=async()=>response(401,{token:'sensitive'});const r=res();await quote(req(),r);assert.equal(r.statusCode,502);assert.equal(requests.length,3);assert.ok(!JSON.stringify(r).includes('sensitive'));
});
test('CEP validation, branch gates and methods run before external calls',async()=>{
 for(const bad of [null,12345678,'123','12345--678','<script>']) { const r=res();await quote(req('POST',{destination_cep:bad}),r);assert.equal(r.statusCode,400); }
 const method=res();await quote(req('GET'),method);assert.equal(method.statusCode,405);
 for(const env of ['production','development']) {process.env.VERCEL_ENV=env;const r=res();await quote(req(),r);assert.equal(r.statusCode,404);}
 process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='main';const r=res();await quote(req(),r);assert.equal(r.statusCode,404);assert.equal(requests.length,0);
});
test('missing config, storage errors, malformed upstream and rate limit fail safely',async()=>{
 delete process.env.ME_TOKEN_ENCRYPTION_KEY;let r=res();await quote(req(),r);assert.equal(r.statusCode,503);
 process.env.ME_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');await fresh();
 calculate=async()=>response(200,{bad:'private'});r=res();await quote(req(),r);assert.equal(r.statusCode,503);
 rate=120;r=res();await quote(req(),r);assert.equal(r.statusCode,429);assert.equal(r.headers['Retry-After'],'60');
});
test('invalid services are filtered and zero delivery time is retained',async()=>{
 await fresh();calculate=async()=>response(200,[{error:'unavailable'},{price:null,delivery_time:3},{price:-1,delivery_time:3},{price:'',delivery_time:1},{price:'12.34',delivery_time:0},{price:'20',delivery_time:null}]);
 const r=res();await quote(req(),r);assert.equal(r.body.servicos.length,1);assert.equal(r.body.servicos[0].prazo_dias,0);
});
test('administrative endpoints require authentication; cross-site migration rejected',async()=>{
 let r=res();await session(req('GET'),r);assert.equal(r.statusCode,401);
 r=res();start(req('GET'),r);assert.equal(r.statusCode,401);
 r=res();await session(admin(req()),r);assert.equal(r.statusCode,403);
});
test('existing production cookie migrates persistently and is cleared only on success',async()=>{
 const request=admin(req());request.headers={...request.headers,cookie:legacyCookie(),'x-me-migrate':'1','sec-fetch-site':'same-origin'};
 const r=res();await session(request,r);assert.equal(r.statusCode,200);assert.equal(r.body.autorizado_no_servidor,true);assert.match(r.headers['Set-Cookie'],/Max-Age=0/);assert.ok(!JSON.stringify(r.body).includes('legacy'));
 assert.equal(await accessToken(),'new-access');
});
test('migration storage failure retains browser cookie; corrupted cookies stay private',async()=>{
 const request=admin(req());request.headers={...request.headers,cookie:legacyCookie(),'x-me-migrate':'1','sec-fetch-site':'same-origin'};
 failSave=true;let r=res();await session(request,r);assert.equal(r.statusCode,503);assert.equal(r.headers['Set-Cookie'],undefined);
 request.headers.cookie='me_prod_session=broken';r=res();await session(request,r);assert.equal(r.statusCode,503);
});
test('OAuth initiation uses existing client, only shipping-calculate and protected state',()=>{
 const r=res();start(admin(req('GET')),r);assert.equal(r.statusCode,302);const url=new URL(r.headers.Location);assert.equal(url.origin,'https://melhorenvio.com.br');assert.equal(url.searchParams.get('client_id'),'123');assert.equal(url.searchParams.get('scope'),'shipping-calculate');assert.match(r.headers['Set-Cookie'],/HttpOnly; Secure/);
});
test('production callback saves tokens server-side, never in a response cookie',async()=>{
 const payload='prod.'+Date.now()+'.nonce',state=payload+'.'+createHmac('sha256','test-secret').update(payload).digest('hex');
 const request=req('GET');request.query={state,code:'fake-code'};request.headers.cookie='me_prod_oauth_state='+state;
 const r=res();await callback(request,r);assert.equal(r.statusCode,200);assert.equal(await accessToken(),'new-access');assert.ok(!JSON.stringify(r).includes('new-refresh'));assert.ok(!JSON.stringify(r).includes('new-access'));
 assert.ok(r.headers['Set-Cookie'].every(c=>c.includes('Max-Age=0')));
});
test('invalid OAuth state or malformed cookie cannot exchange codes',async()=>{
 for(const cookie of ['me_prod_oauth_state=invalid','me_prod_oauth_state=%ZZ']) {const request=req('GET');request.query={state:'prod.invalid',code:'fake'};request.headers.cookie=cookie;const r=res();await callback(request,r);assert.equal(r.statusCode,403);}
 assert.equal(requests.length,0);
});
test('early renewal respects expiry safety margin',async()=>{
 await saveTokens({access_token:'almost-expired',refresh_token:'refresh',expires_at:Date.now()+60000});
 assert.equal(await accessToken(),'new-access');assert.equal(requests.length,1);
});
test('wrong encryption key and inaccessible storage fail without exposing details',async()=>{
 await fresh();process.env.ME_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,8).toString('base64');
 let r=res();await quote(req(),r);assert.equal(r.statusCode,503);assert.ok(!JSON.stringify(r).includes('old-access'));
 globalThis.fetch=async()=>{throw Error('sensitive Redis connection info');};
 r=res();await quote(req(),r);assert.equal(r.statusCode,503);assert.ok(!JSON.stringify(r).includes('sensitive'));
});
test('all changed administrative handlers are disabled on main and production',async()=>{
 for(const [env,branch] of [['production','revisao-home-etapa-1-2026-10'],['preview','main']]) {
  process.env.VERCEL_ENV=env;process.env.VERCEL_GIT_COMMIT_REF=branch;
  for(const handler of [session,callback,start]) {const r=res();await handler(admin(req('GET')),r);assert.equal(r.statusCode,404);}
 }
 assert.equal(requests.length,0);
});
test('browser-provided box and origin overrides are ignored',async()=>{
 await fresh();const r=res();await quote(req('POST',{destination_cep:'20040020',origin:'00000000',package:{weight:0.1},quantity:99}),r);
 assert.equal(r.statusCode,200);const payload=JSON.parse(requests[0].body);assert.equal(payload.from.postal_code,'08790200');assert.equal(payload.package.weight,9);assert.equal(payload.quantity,undefined);
});
