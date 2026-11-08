import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {chromium} from "playwright";

// The source is a *recorded* piano sample from Meta Open Sound, not a sine fixture.
// The separate CI workflow downloads the asset from a pinned commit and checks
// its official collection SHA256SUMS before invoking this test.
const expectedSha="f6df379bfb60e074fdb640eb33298a3150960b9c27fa9247740036fb8d9b55d6";
const filename=process.env.ASAHI_REAL_PIANO_OGG;
assert.ok(filename, "ASAHI_REAL_PIANO_OGG path required");
const bytes=fs.readFileSync(filename);
assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),expectedSha);
assert.equal(bytes.subarray(0,4).toString("ascii"),"OggS");
const root=process.cwd();
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,"http://127.0.0.1").pathname;
  const file=path.resolve(root,"."+pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404).end();return;
  }
  res.writeHead(200,{"Content-Type":file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8"});
  fs.createReadStream(file).pipe(res);
});
let browser;
try{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.goto("http://127.0.0.1:"+server.address().port+"/tools/local-sampler.html");
  await page.locator("#source").setInputFiles({
    name:"INSPiano_Vel03_C4_01.ogg",mimeType:"audio/ogg",buffer:bytes
  });
  await page.locator("#permission").check();
  await page.locator("#rootMidi").fill("60");
  // A real recorded C4 is the reference pitch; verify the sample decoder,
  // diagnostics and ability to export one non-synthetic sounding note.
  await page.locator("#mode").selectOption("single");
  await page.locator("#run").click();
  await page.locator("#result").waitFor({state:"visible",timeout:60000});
  const sourceAudit=await page.locator("#sampleQuality").innerText();
  assert.match(sourceAudit,/INSPiano_Vel03_C4_01.ogg/);
  assert.match(sourceAudit,/RMS .+dBFS/);
  assert.match(await page.locator("#details").innerText(),/演奏音符1個/);
  const [shortDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#download").click()]);
  const short=fs.readFileSync(await shortDownload.path());
  assert.equal(short.readUInt32LE(24),24000);
  assert.equal(short.readUInt32LE(40),4*24000*2);
  assert.ok(short.subarray(44,44+20000).some(x=>x!==0),"Real C4 should not be silent");

  await page.locator("#mode").selectOption("guide");
  await page.locator("#run").click();
  await page.locator("#result").waitFor({state:"visible",timeout:60000});
  const details=await page.locator("#details").innerText();
  assert.match(details,/30秒のガイド/);
  assert.match(details,/演奏音符30個/);
  const [longDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#download").click()]);
  const output=fs.readFileSync(await longDownload.path());
  assert.equal(output.subarray(0,4).toString("ascii"),"RIFF");
  assert.equal(output.readUInt32LE(24),24000);
  assert.equal(output.readUInt32LE(40),32*24000*2);
  assert.ok(output.subarray(44,44+24000*2).some(x=>x!==0));
  assert.ok(output.subarray(44+30*24000*2).every(x=>x===0),"2s appended PCM tail must be zero");
  assert.deepEqual(errors,[]);
  const outDir=process.env.ASAHI_ARTIFACTS_DIR;
  if(outDir){
    fs.mkdirSync(outDir,{recursive:true});
    fs.writeFileSync(path.join(outDir,"meta-piano-C4-recorded-source-guide-30s-plus-2s.wav"),output);
    fs.writeFileSync(path.join(outDir,"audit.json"),JSON.stringify({
      asset:"INSPiano_Vel03_C4_01.ogg",
      upstreamCommit:"251c0be57d5d1b3242b91f53e0cde62ab1cb42d9",
      sourceSha256:expectedSha,license:"CC0-1.0",
      sourceType:"recorded-piano-ogg-preview",
      sourceSize:bytes.length,diagnosticText:sourceAudit,renderText:details,
      outputWavBytes:output.length,outputSeconds:32,checks:"Chromium decoded real OGG; one-note and 30-note WAV outputs; true 2s silence",
      limitations:"No human listening, no iOS/Android check, no full-resolution 24-bit WAV check, not production bundled"
    },null,2)+"\n");
  }
  console.log("PASS: pinned CC0 recorded piano OGG decoded, diagnostics rendered, 1-note and 30-note WAV generated; output has 2s true silence");
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
