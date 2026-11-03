import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ace/[...path].js';

async function invoke({token,provided,method='GET',path=['health'],base='https://gpu.invalid'}={}){
  const saved={EMUZII_PROXY_TOKEN:process.env.EMUZII_PROXY_TOKEN,ACESTEP_API_URL:process.env.ACESTEP_API_URL,ACESTEP_API_KEY:process.env.ACESTEP_API_KEY};
  const prior=globalThis.fetch;
  let calls=0;
  const res={code:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(v){this.body=v;return this},send(v){this.body=v;return this},end(){return this}};
  try{
    if(token===undefined)delete process.env.EMUZII_PROXY_TOKEN;else process.env.EMUZII_PROXY_TOKEN=token;
    process.env.ACESTEP_API_URL=base;
    process.env.ACESTEP_API_KEY='test-only-fake-not-real';
    globalThis.fetch=async()=>{calls++;return {status:200,headers:{get:()=> 'application/json'},text:async()=> '{"ok":true}'}};
    await handler({method,query:{path},headers:{origin:'https://example.invalid','x-emuzii-access':provided}},res);
    return {status:res.code,body:res.body,calls};
  }finally{
    globalThis.fetch=prior;
    for(const k of Object.keys(saved))saved[k]===undefined?delete process.env[k]:process.env[k]=saved[k];
  }
}
test('missing token fails closed, even with a configured GPU URL',async()=>{
  const r=await invoke();
  assert.equal(r.status,503);
  assert.equal(r.calls,0);
  assert.match(r.body.error,/not configured/);
});
test('empty token also fails closed without GPU invocation',async()=>{
  const r=await invoke({token:''});
  assert.equal(r.status,503);
  assert.equal(r.calls,0);
});
test('wrong access token is unauthorized without GPU invocation',async()=>{
  const r=await invoke({token:'mock-token',provided:'wrong'});
  assert.equal(r.status,401);
  assert.equal(r.calls,0);
});
test('valid mock auth reaches only mocked health endpoint',async()=>{
  const r=await invoke({token:'mock-token',provided:'mock-token'});
  assert.equal(r.status,200);
  assert.equal(r.calls,1);
  assert.equal(r.body,'{"ok":true}');
});
test('unlisted routes are rejected before proxying',async()=>{
  const r=await invoke({token:'mock-token',provided:'mock-token',path:['admin','secrets']});
  assert.equal(r.status,404);
  assert.equal(r.calls,0);
});
