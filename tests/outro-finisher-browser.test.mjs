import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();

function exampleWav({quietSeconds=0}={}) {
  const sr=16000, frames=sr, b=Buffer.alloc(44+frames*2);
  b.write("RIFF",0);b.writeUInt32LE(b.length-8,4);b.write("WAVE",8);
  b.write("fmt ",12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)b.writeInt16LE(i>=frames-Math.round(quietSeconds*sr)?0:Math.round(Math.sin(i*2*Math.PI*440/sr)*.2*32767),44+i*2);
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
  await page.locator("#preflightInfo").getByText(/要確認/).waitFor({state:"visible",timeoutMs:20000});
  assert.equal(await page.locator("#run").isDisabled(),true);
  assert.equal(await page.locator("#riskCheck").isVisible(),true);
  assert.match(await page.locator("#preflightWarning").innerText(),/途中で切れた歌詞/);
  await page.locator("#listenOriginalEnd").click();
  await page.locator("#allowRisk").check();
  assert.equal(await page.locator("#run").isEnabled(),true);
  await page.locator("#run").click();
  await page.locator("#done").waitFor({state:"visible",timeoutMs:20000});
  assert.match(await page.locator("#details").innerText(),/無音 2.00秒/);
  assert.match(await page.locator("#warning").innerText(),/途中切れの可能性/);
  assert.match(await page.locator("#endInfo").innerText(),/最後まで音が続いています/);
  await page.locator("#listenEnd").click();
  assert.match(await page.locator("#qualityStatus").innerText(),/未確認/);
  await page.locator("#lyricsChecked").check();
  await page.locator("#outroChecked").check();
  await page.locator("#silenceChecked").check();
  assert.match(await page.locator("#qualityStatus").innerText(),/自分で確認済み/);
  const [download]=await Promise.all([
    page.waitForEvent("download"),
    page.locator("#download").click()
  ]);
  assert.equal(download.suggestedFilename(),"original-outro-safe.wav");
  const downloaded=fs.readFileSync(await download.path());
  const sampleRate=downloaded.readUInt32LE(24);
  const frames=downloaded.readUInt32LE(40)/2;
  // decodeAudioData may resample the 16kHz upload to AudioContext's output rate.
  // Compare against the output WAV header, not the input's sample rate.
  assert.equal(downloaded.readUInt16LE(22),1);
  assert.equal(frames,Math.round(3*sampleRate));
  assert.equal(downloaded.readInt16LE(44+2*(sampleRate-1))!==0,true);
  assert.equal(downloaded.subarray(44+2*sampleRate).every(x=>x===0),true);
  // The second input has a deliberately quiet 0.8s outro, so no active-tail warning.
  await page.locator("#source").setInputFiles({name:"quiet.wav",mimeType:"audio/wav",buffer:exampleWav({quietSeconds:.8})});
  assert.equal(await page.locator("#lyricsChecked").isChecked(),false);
  await page.locator("#preflightInfo").getByText(/静かな終わり/).waitFor({state:"visible",timeoutMs:20000});
  assert.equal(await page.locator("#riskCheck").isVisible(),false);
  assert.equal(await page.locator("#allowRisk").isChecked(),false);
  assert.equal(await page.locator("#run").isEnabled(),true);
  await page.locator("#run").click();
  await page.locator("#endInfo").getByText(/静かな終わり/).waitFor({state:"visible",timeoutMs:20000});
  assert.equal(await page.locator("#warning").isVisible(),false);
  assert.match(await page.locator("#qualityStatus").innerText(),/未確認/);
  assert.deepEqual(pageErrors,[]);
  console.log("PASS: preflight original → active-tail guard → WAV output → manual review → quiet-tail no override");
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
