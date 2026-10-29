import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root=process.cwd();
const mime={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8',
  '.wav':'audio/wav',
  '.mp3':'audio/mpeg'
};

function safeFilePath(requestUrl){
  const u=new URL(requestUrl,'http://127.0.0.1');
  let pathname=decodeURIComponent(u.pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+path.sep))return null;
  return file;
}

const server=http.createServer((req,res)=>{
  const file=safeFilePath(req.url||'/');
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('not found');return;
  }
  res.writeHead(200,{
    'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream',
    'cache-control':'no-store'
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
});
const address=server.address();
const base='http://127.0.0.1:'+address.port+'/';

let browser;
try{
  browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext();
  const pageErrors=[],consoleErrors=[];
  context.on('page',p=>{
    p.on('pageerror',e=>pageErrors.push({url:p.url()||'page',message:e.message,stack:e.stack||''}));
    p.on('console',msg=>{if(msg.type()==='error')consoleErrors.push({url:p.url()||'page',text:msg.text()})});
  });
  const page=await context.newPage();

  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#testVocalBridgeTabs',{state:'visible',timeout:60000});
  await page.waitForSelector('#testVocalBridge',{state:'visible',timeout:60000});

  await page.locator('#testVocalBridge').click();
  await page.waitForFunction(
    ()=>document.querySelector('#vocalBridgeStatus')?.textContent?.includes('連携診断PASS'),
    {timeout:30000}
  );
  const sameTab=await page.locator('#vocalBridgeStatus').textContent();
  assert.match(sameTab,/連携診断PASS/);
  assert.match(sameTab,/実取り込み3\.10秒/);
  console.log('PASS same-tab Studio bridge diagnostic');

  const popupPromise=context.waitForEvent('page',{timeout:10000});
  await page.locator('#testVocalBridgeTabs').click();
  const child=await popupPromise;
  await child.waitForLoadState('domcontentloaded',{timeout:30000}).catch(()=>{});

  try{
    await page.waitForFunction(
      ()=>document.querySelector('#vocalBridgeStatus')?.textContent?.includes('実タブ往復診断PASS'),
      {timeout:30000}
    );
  }catch(error){
    const parentStatus=await page.locator('#vocalBridgeStatus').textContent().catch(()=>'<missing>');
    let childInfo={closed:child.isClosed(),url:child.url()};
    if(!child.isClosed()){
      childInfo={
        ...childInfo,
        title:await child.title().catch(()=>'<no-title>'),
        bridgeStatus:await child.locator('#studioBridgeStatus').textContent().catch(()=>'<missing>'),
        status:await child.locator('#status').textContent().catch(()=>'<missing>'),
        songId:await child.locator('#songId').inputValue().catch(()=>'<missing>'),
        takeName:await child.locator('#takeName').inputValue().catch(()=>'<missing>'),
        start:await child.locator('#startSeconds').inputValue().catch(()=>'<missing>'),
        offset:await child.locator('#offset').inputValue().catch(()=>'<missing>'),
        opener:await child.evaluate(()=>({hasOpener:!!window.opener,openerClosed:window.opener?.closed??null,origin:location.origin})).catch(()=>null)
      };
    }
    const handoffRows=await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{
        const q=indexedDB.open('asahi-vocal-handoff-v1',1);
        q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
      });
      return await new Promise((resolve,reject)=>{
        const t=db.transaction('handoffs','readonly'),q=t.objectStore('handoffs').getAll();
        q.onsuccess=()=>resolve((q.result||[]).map(r=>({token:r.token,kind:r.kind,songId:r.songId,takeName:r.takeName,crossTabDiagnostic:r.crossTabDiagnostic,diagnosticId:r.diagnosticId})));
        q.onerror=()=>reject(q.error);t.oncomplete=()=>db.close();
      });
    }).catch(e=>[{error:String(e)}]);
    console.error('CROSS_TAB_DEBUG',JSON.stringify({parentStatus,childInfo,handoffRows,pageErrors,consoleErrors},null,2));
    throw error;
  }
  const crossTab=await page.locator('#vocalBridgeStatus').textContent();
  assert.match(crossTab,/実タブ往復診断PASS/);
  assert.match(crossTab,/戻りTAKE 3\.10秒/);
  assert.match(crossTab,/ACK/);
  assert.match(crossTab,/Vocalタブ自動終了/);
  console.log('PASS real child-tab roundtrip diagnostic');

  const deadline=Date.now()+6000;
  while(!child.isClosed()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
  assert.equal(child.isClosed(),true,'Vocal child tab should close after ACK');
  assert.equal(context.pages().filter(p=>!p.isClosed()).length,1,'Only Studio tab should remain open');

  const diagnosticRows=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const q=indexedDB.open('asahi-vocal-handoff-v1',1);
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    return await new Promise((resolve,reject)=>{
      const t=db.transaction('handoffs','readonly'),q=t.objectStore('handoffs').getAll();
      q.onsuccess=()=>resolve((q.result||[]).map(r=>({token:r.token,kind:r.kind})));
      q.onerror=()=>reject(q.error);
      t.oncomplete=()=>db.close();
    });
  });
  const leaked=diagnosticRows.filter(r=>/^(diag-|diag-tab|diag-to-studio|diag-return)/.test(String(r.token||'')));
  assert.deepEqual(leaked,[],'Diagnostic handoff rows should be deleted');
  console.log('PASS diagnostic handoff cleanup');

  assert.deepEqual(pageErrors,[],'No uncaught page errors expected');
  assert.deepEqual(consoleErrors,[],'No browser console errors expected');
  console.log('PASS no uncaught browser page/console errors');
  console.log('ALL VOCAL BRIDGE BROWSER TESTS PASS');
}finally{
  if(browser)await browser.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
