import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ace/[...path].js';

// Entire test runs on fabricated responses. Never connects to GPU/third-party APIs.
async function withFakeServer(check){
  const previous={
    EMUZII_PROXY_TOKEN:process.env.EMUZII_PROXY_TOKEN,
    ACESTEP_API_URL:process.env.ACESTEP_API_URL,
    ACESTEP_API_KEY:process.env.ACESTEP_API_KEY,
    EMUZII_ALLOWED_ORIGIN:process.env.EMUZII_ALLOWED_ORIGIN
  };
  const realFetch=globalThis.fetch;
  const trace=[],payload=Buffer.from([82,73,70,70,0,0,0,0,87,65,86,69]);
  process.env.EMUZII_PROXY_TOKEN='unit-front-token';
  process.env.ACESTEP_API_URL='https://only-mocked.invalid';
  process.env.ACESTEP_API_KEY='unit-backend-key';
  process.env.EMUZII_ALLOWED_ORIGIN='https://studio.invalid';
  globalThis.fetch=async(url,opts)=>{
    const u=new URL(url);
    assert.equal(u.origin,'https://only-mocked.invalid');
    assert.equal(opts.headers.Authorization,'Bearer unit-backend-key');
    const body=opts.body?JSON.parse(opts.body):null;
    trace.push({path:u.pathname,query:u.searchParams.toString(),method:opts.method,body});
    let response;
    if(u.pathname==='/release_task')response={task_id:'mock-task-001',status:'queued'};
    else if(u.pathname==='/query_result')response={task_id:body?.task_id,status:'success',audio_path:'ci-sine.wav'};
    else if(u.pathname==='/health')response={status:'healthy',mock:true};
    else if(u.pathname==='/v1/audio'){
      return {status:200,headers:{get:()=> 'audio/wav'},arrayBuffer:async()=>Uint8Array.from(payload).buffer};
    } else throw Error('Unexpected mocked path: '+u.pathname);
    return {status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(response)};
  };
  async function request(path,{method='GET',body,query={},access='unit-front-token'}={}){
    const res={code:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(code){this.code=code;return this},json(value){this.body=value;return this},send(value){this.body=value;return this},end(){return this}};
    await handler({method,headers:{origin:'https://studio.invalid','x-emuzii-access':access},query:{path:path.split('/'),...query},body},res);
    return res;
  }
  try{await check({request,trace,payload})}
  finally{
    globalThis.fetch=realFetch;
    for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v}
  }
}
test('ACE-Step mock: manual release, status query, then audio bytes without GPU',async()=>{
  await withFakeServer(async({request,trace,payload})=>{
    const release=await request('release_task',{method:'POST',body:{prompt:'synthetic demo only',duration:3}});
    assert.equal(release.code,200);
    assert.equal(release.headers['Cache-Control'],'no-store');
    assert.equal(JSON.parse(release.body).task_id,'mock-task-001');
    const query=await request('query_result',{method:'POST',body:{task_id:'mock-task-001'}});
    const result=JSON.parse(query.body);
    assert.equal(result.status,'success');assert.equal(result.audio_path,'ci-sine.wav');
    const audio=await request('v1/audio',{query:{path:['v1','audio'],file:'ci-sine.wav'}});
    assert.equal(audio.code,200);
    assert.equal(audio.headers['Content-Type'],'audio/wav');
    assert.ok(Buffer.isBuffer(audio.body));
    assert.deepEqual(audio.body,payload);
    assert.deepEqual(trace.map(x=>x.method+' '+x.path),['POST /release_task','POST /query_result','GET /v1/audio']);
    assert.equal(trace[0].body.prompt,'synthetic demo only');
    assert.equal(trace[2].query,'file=ci-sine.wav');
  });
});
test('ACE-Step mock: wrong token cannot create a task or fetch audio',async()=>{
  await withFakeServer(async({request,trace})=>{
    for(const [path,method] of [['release_task','POST'],['v1/audio','GET']]){
      const r=await request(path,{method,access:'invalid'});
      assert.equal(r.code,401);
    }
    assert.equal(trace.length,0);
  });
});
test('ACE-Step mock: status health and CORS restriction',async()=>{
  await withFakeServer(async({request,trace})=>{
    const r=await request('health');
    assert.equal(r.code,200);
    assert.equal(r.headers['Access-Control-Allow-Origin'],'https://studio.invalid');
    assert.equal(JSON.parse(r.body).mock,true);
    assert.equal(trace.length,1);
  });
});
