import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();

function exampleWav() {
  const sr=16000, frames=sr, b=Buffer.alloc(44+frames*2);
  b.write("RIFF",0);b.writeUInt32LE(b.length-8,4);b.write("WAVE",8);
  b.write("fmt ",12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/sr)*.2*32767),44+i*2);
  return b;
}
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  const pathnameResolved=path.resolve(root,"."+pathname);
  if(!pathnameResolved.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(!fs.existsSync(pathnameResolved)||!fs.statSync(pathnameResolved).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{"Content-Type":pathname.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8"});
  fs.createReadStream(pathnameResolved).pipe(res);
});
let browser;
try{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({acceptDownloads:true});
  const pageErrors=[];page.on("pageerror",e=>pageErrors.push(String(e)));
  await page.goto("http://127.0.0.1:"+server.address().port+"/tools/outro-finisher.html");
  await page.locator("#source").setInputFiles({name:"original.wav",mimeType:"audio/wav",buffer:exampleWav()});
  await page.locator("#run").click();
  await page.locator("#done").waitFor({state:"visible",timeoutMs:20000});
  assert.match(await page.locator("#details").innerText(),/無音 2.00秒/);
  assert.match(await page.locator("#warning").innerText(),/途中切れの可能性/);
  const [download]=await Promise.all([
    page.waitForEvent("download"),
    page.locator("#download").click()
  ]);
  assert.equal(download.suggestedFilename(),"original-outro-safe.wav");
  const downloaded=fs.readFileSync(await download.path());
  const frames=downloaded.readUInt32LE(40)/2;
  assert.equal(frames,16000+32000);
  assert.equal(downloaded.readUInt16LE(22),1);
  assert.equal(downloaded.readUInt32LE(24),16000);
  assert.equal(downloaded.readInt16LE(44+2*(16000-1))!==0,true);
  assert.equal(downloaded.subarray(44+2*16000).every(x=>x===0),true);
  assert.deepEqual(pageErrors,[]);
  console.log("PASS: browser upload → decode → WAV download → warning and zero tail");
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
