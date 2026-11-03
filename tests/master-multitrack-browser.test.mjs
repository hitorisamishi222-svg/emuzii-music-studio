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
  // Deleting a track is reversible during the editing session. Restore
  // its original ID, slot, and raw audio before autosave snapshots it.
  const trackIds=await page.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
  assert.equal(trackIds.length,2);
  await page.locator('#tracks article.track').first().locator('[data-action="delete"]').click();
  assert.equal(await page.locator('#tracks article.track').count(),1);
  assert.equal(await page.locator('#undoTrackDelete').isEnabled(),true);
  await page.locator('#undoTrackDelete').click();
  assert.deepEqual(await page.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),trackIds);
  assert.equal(await page.locator('#undoTrackDelete').isEnabled(),false);
  console.log('PASS deleted backing track restores same identity and order');

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

  // Safely erase saved data without erasing the two currently edited tracks.
  await page.locator('#saveProject').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#clearProject').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('再保存するまで自動保存しません'));
  assert.equal(await page.locator('#tracks').textContent(),beforeTracks);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(180);
  const countDb=async()=>page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('piyoko-music-v45',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','blobs'],'readonly');
      const a=tx.objectStore('projects').count(),b=tx.objectStore('blobs').count();
      tx.oncomplete=()=>resolve({projects:a.result,blobs:b.result});
      tx.onerror=()=>reject(tx.error);
    });
    db.close();return result;
  });
  assert.deepEqual(await countDb(),{projects:0,blobs:0},'Deletion should not resurrect autosave or blobs');
  await page.locator('#saveProject').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  const afterSave=await countDb();
  assert.ok(afterSave.projects>=1&&afterSave.blobs>=2,'Manual save after delete must restore audio');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-view="project"]').click();
  await page.locator('#loadProject').click();
  await page.waitForFunction(()=>document.querySelector('#tracks')?.textContent?.includes('vocal-ci'));
  assert.match(await page.locator('#tracks').textContent(),/backing-ci/);
  console.log('PASS delete suspends autosave, manual save re-creates audio and reload restores tracks');

  // Legacy migration: the historical blob lives ONLY in v44.
  const legacy=await browser.newPage();
  await legacy.goto(base,{waitUntil:'domcontentloaded'});
  await legacy.waitForSelector('#loadProject',{state:'attached'});
  await legacy.evaluate(async bytes=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('piyoko-music-v44',1);
      q.onupgradeneeded=()=>{
        if(!q.result.objectStoreNames.contains('projects'))q.result.createObjectStore('projects',{keyPath:'id'});
        if(!q.result.objectStoreNames.contains('blobs'))q.result.createObjectStore('blobs',{keyPath:'id'});
      };
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','blobs'],'readwrite');
      tx.objectStore('blobs').put({id:'asset:legacy-audio',blob:new Blob([Uint8Array.from(bytes)],{type:'audio/wav'})});
      tx.objectStore('projects').put({id:'last',name:'CI legacy project',tracks:[{
        id:'legacy-audio',name:'legacy-voice',type:'vocal',blobId:'asset:legacy-audio'
      }]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  },Array.from(vocal));
  await legacy.locator('[data-view="project"]').click();
  await legacy.locator('#loadProject').click();
  await legacy.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('旧バージョンのプロジェクトを復元しました'));
  assert.match(await legacy.locator('#tracks').textContent(),/legacy-voice/);
  await legacy.locator('#saveProject').click();
  await legacy.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  await legacy.reload({waitUntil:'domcontentloaded'});
  await legacy.locator('[data-view="project"]').click();
  await legacy.locator('#loadProject').click();
  await legacy.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.match(await legacy.locator('#tracks').textContent(),/legacy-voice/);
  await legacy.close();
  console.log('PASS migration v44 audio copies into current v45 database and survives reload');

  // Vocal preroll regression: original Blob still has count-in samples, while
  // reloaded playback and exported WAV must use the metadata-trimmed timeline.
  const prerollPage=await browser.newPage({acceptDownloads:true});
  await prerollPage.goto(base,{waitUntil:'domcontentloaded'});
  await prerollPage.waitForSelector('#loadProject',{state:'attached'});
  await prerollPage.evaluate(async bytes=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('piyoko-music-v45',1);
      q.onupgradeneeded=()=>{
        if(!q.result.objectStoreNames.contains('projects'))q.result.createObjectStore('projects',{keyPath:'id'});
        if(!q.result.objectStoreNames.contains('blobs'))q.result.createObjectStore('blobs',{keyPath:'id'});
      };
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','blobs'],'readwrite');
      tx.objectStore('blobs').put({id:'asset:preroll-ci',blob:new Blob([Uint8Array.from(bytes)],{type:'audio/wav'})});
      tx.objectStore('projects').put({id:'last',name:'Count-in metadata CI',tracks:[{
        id:'preroll-ci',name:'trimmed-vocal-ci',type:'vocal',blobId:'asset:preroll-ci',
        recordTrimStartSec:.5,gain:1,pan:0,start:0,fadeIn:0,fadeOut:0,mute:false,solo:false
      }]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  },Array.from(vocal));
  await prerollPage.locator('[data-view="project"]').click();
  await prerollPage.locator('#loadProject').click();
  await prerollPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.match(await prerollPage.locator('#durationLabel').textContent(),/0\.8s/,'1.3s original minus 0.5s count-in');
  await prerollPage.locator('#saveProject').click();
  await prerollPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('音源を含めて端末に保存しました'));
  await prerollPage.reload({waitUntil:'domcontentloaded'});
  await prerollPage.locator('[data-view="project"]').click();
  await prerollPage.locator('#loadProject').click();
  await prerollPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  assert.match(await prerollPage.locator('#durationLabel').textContent(),/0\.8s/);
  const downloadTrim=prerollPage.waitForEvent('download',{timeout:30000});
  await prerollPage.evaluate(()=>{
    document.querySelector('#masterLimiter').checked=false;
    document.querySelector('#structuralRenderEnabled').checked=false;
    document.querySelector('#exportMasterWav').click();
  });
  const wavDownload=await downloadTrim,parts=[];
  for await(const chunk of await wavDownload.createReadStream())parts.push(chunk);
  const trimmedAudio=Buffer.concat(parts);
  const early=rmsWav(trimmedAudio,.05,.12),audible=rmsWav(trimmedAudio,.38,.48);
  assert.ok(early<.006,'Trimmed count-in should not introduce early vocals');
  assert.ok(audible>.012,'Vocal must start at original .8s minus trim .5s = .3s');
  const originalSize=await prerollPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('piyoko-music-v45');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction('blobs','readonly'),q=tx.objectStore('blobs').get('asset:preroll-ci');
      q.onsuccess=()=>resolve(q.result?.blob?.size);q.onerror=()=>reject(q.error);
    });db.close();return result;
  });
  assert.equal(originalSize,vocal.length,'Original microphone bytes stay untouched');

  // Invalid metadata must not replace a valid currently edited take.
  await prerollPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('piyoko-music-v45');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite'),q=tx.objectStore('projects').get('last');
      q.onsuccess=()=>{const record=q.result;record.tracks[0].recordTrimStartSec=100;tx.objectStore('projects').put(record)};
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  });
  const validTracks=await prerollPage.locator('#tracks').textContent();
  await prerollPage.locator('#loadProject').click();
  await prerollPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('トリム位置が不正です'));
  assert.equal(await prerollPage.locator('#tracks').textContent(),validTracks);
  await prerollPage.close();
  console.log('PASS raw vocal recording preserved, trim metadata survives reload and unsafe trim rejected');

  // A damaged edit mix field must not replace the currently audible recording.
  const metadataPage=await browser.newPage();
  await metadataPage.goto(base,{waitUntil:'domcontentloaded'});
  await metadataPage.waitForSelector('#loadProject',{state:'attached'});
  await metadataPage.evaluate(async bytes=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('piyoko-music-v45',1);
      q.onupgradeneeded=()=>{
        if(!q.result.objectStoreNames.contains('projects'))q.result.createObjectStore('projects',{keyPath:'id'});
        if(!q.result.objectStoreNames.contains('blobs'))q.result.createObjectStore('blobs',{keyPath:'id'});
      };
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects','blobs'],'readwrite');
      tx.objectStore('blobs').put({id:'asset:normal-ci',blob:new Blob([Uint8Array.from(bytes)],{type:'audio/wav'})});
      tx.objectStore('projects').put({id:'last',name:'safe original',tracks:[{
        id:'normal-ci',name:'valid-ci-take',type:'vocal',blobId:'asset:normal-ci',gain:1,pan:0,start:0,fadeIn:0,fadeOut:0
      }]});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  },Array.from(vocal));
  await metadataPage.locator('[data-view="project"]').click();
  await metadataPage.locator('#loadProject').click();
  await metadataPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('前回プロジェクトを復元しました'));
  const liveIds=await metadataPage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
  const liveUI=await metadataPage.locator('#tracks').textContent();
  await metadataPage.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('piyoko-music-v45');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite'),q=tx.objectStore('projects').get('last');
      q.onsuccess=()=>{
        const item=q.result;item.tracks[0].pan='NaN';tx.objectStore('projects').put(item);
      };
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  });
  await metadataPage.locator('#loadProject').click();
  await metadataPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('PANが不正'));
  assert.deepEqual(await metadataPage.locator('#tracks article.track').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),liveIds);
  assert.equal(await metadataPage.locator('#tracks').textContent(),liveUI,'Live edit must not be replaced by corrupt saved PAN');
  await metadataPage.close();
  console.log('PASS invalid stored mix field refused before editor state changes');



  assert.deepEqual(errors,[],'No page errors during real WAV render');
  console.log('PASS actual Chromium multi-track MASTER WAV export contains backing and vocal');
}finally{
  if(browser)await browser.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
