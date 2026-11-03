import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root=process.cwd();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};
function syntheticWav({duration=1.3,start=0,end=.4,freq=440}={}){
  const sr=16000,n=Math.round(duration*sr),out=Buffer.alloc(44+n*2);
  out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVE',8);
  out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);
  out.writeUInt16LE(1,22);out.writeUInt32LE(sr,24);out.writeUInt32LE(sr*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){const t=i/sr,active=t>=start&&t<end;
    const env=Math.min(1,(t-start)*30,(end-t)*30);
    const value=active?Math.sin(t*2*Math.PI*freq)*.36*Math.max(0,env):0;
    out.writeInt16LE(Math.round(value*32767),44+i*2);
  }
  return out;
}
function rmsWav(bytes,start,end){
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WAVE');
  const sampleRate=bytes.readUInt32LE(24),channels=bytes.readUInt16LE(22),bits=bytes.readUInt16LE(34);
  assert.equal(bits,16);
  const samples=bytes.readUInt32LE(40)/(channels*2);
  let sum=0,count=0;
  for(let i=Math.floor(start*sampleRate);i<Math.min(samples,Math.floor(end*sampleRate));i++){
    const value=bytes.readInt16LE(44+i*channels*2)/32768;
    sum+=value*value;count++;
  }
  return count?Math.sqrt(sum/count):0;
}
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/sw.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end('// CI no-op SW');return}
  let p=decodeURIComponent(u.pathname);if(p.endsWith('/'))p+='index.html';
  const file=path.resolve(root,'.'+p);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('not found');return}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const base='http://127.0.0.1:'+server.address().port+'/';
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#mainFile',{state:'attached',timeout:30000});
  let aceRequests=0;
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/ace'))aceRequests++});
  await page.locator('[data-view="create"]').click();
  await page.locator('#songDesign').fill('Warm city pop with gentle piano and acoustic guitar');
  await page.locator('#lyrics').fill('[Verse]\\nここから始まる');
  await page.locator('#aceDraftPreview').click();
  await page.waitForFunction(()=>document.querySelector('#aceDraftOutput')?.textContent?.includes('OFFLINE_ONLY_NO_NETWORK'));
  const draft=await page.locator('#aceDraftOutput').textContent();
  assert.match(draft,/"audio_duration": 270/);
  assert.match(draft,/"bpm": 96/);
  assert.match(draft,/音声は生成しません/);
  assert.equal(aceRequests,0,'Offline preview must make no ACE calls');
  await page.locator('[data-view="edit"]').click();

  const backing=syntheticWav({start:.05,end:.4,freq:440});
  const vocal=syntheticWav({start:.8,end:1.15,freq:659});
  await page.locator('#mainFile').setInputFiles({name:'backing-ci.wav',mimeType:'audio/wav',buffer:backing});
  await page.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('backing-ci'),{timeout:15000});
  await page.locator('#vocalFile').setInputFiles({name:'vocal-ci.wav',mimeType:'audio/wav',buffer:vocal});
  await page.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('vocal-ci'),{timeout:15000});
  await page.evaluate(()=>{
    document.querySelector('#masterLimiter').checked=false;
    document.querySelector('#structuralRenderEnabled').checked=false;
  });
  const downloading=page.waitForEvent('download',{timeout:30000});
  await page.evaluate(()=>document.querySelector('#exportMasterWav').click());
  const download=await downloading;
  assert.match(download.suggestedFilename(),/emuzii-master-.*\.wav/);
  const pieces=[];for await(const chunk of await download.createReadStream())pieces.push(chunk);
  const rendered=Buffer.concat(pieces);
  const first=rmsWav(rendered,.13,.27);
  const second=rmsWav(rendered,.91,1.02);
  console.log('MASTER_AUDIO_RMS',JSON.stringify({first,second,bytes:rendered.length}));
  assert.ok(first>.012,'Backing must be audible in exported master at 0.2 seconds');
  assert.ok(second>.012,'Vocal must be audible in exported master at 1.0 seconds');
  // Broken saved project must not replace the live two-track editor state.
  const beforeTracks=await page.locator('#tracks').textContent();
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('piyoko-music-v45',1);
      req.onupgradeneeded=()=>{
        const d=req.result;
        if(!d.objectStoreNames.contains('projects'))d.createObjectStore('projects',{keyPath:'id'});
        if(!d.objectStoreNames.contains('blobs'))d.createObjectStore('blobs',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put({id:'last',name:'Broken synthetic CI restore',tracks:[{id:'ci-missing',name:'missing-ci.wav',type:'vocal',blobId:'asset:not-present'}]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
  });
  await page.locator('[data-view="project"]').click();
  await page.locator('#loadProject').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源「missing-ci.wav」が見つかりません'));
  assert.equal(await page.locator('#tracks').textContent(),beforeTracks,'Broken backup must preserve current two tracks');
  console.log('PASS broken backup is refused without replacing current music');
  assert.deepEqual(errors,[],'No page errors during real WAV render');
  console.log('PASS actual Chromium multi-track MASTER WAV export contains backing and vocal');
}finally{
  if(browser)await browser.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
