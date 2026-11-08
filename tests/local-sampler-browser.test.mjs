import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {chromium} from "playwright";
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://localhost").pathname;
 const file=path.resolve(root,"."+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{"Content-Type":file.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8"});
 fs.createReadStream(file).pipe(res);
});
function fixtureWav(){
 const sr=24000,frames=sr*2;
 const bytes=Buffer.alloc(44+frames*2),p=44;
 bytes.write("RIFF",0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write("WAVE",8);
 bytes.write("fmt ",12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
 bytes.writeUInt32LE(sr,24);bytes.writeUInt32LE(sr*2,28);bytes.writeUInt16LE(2,32);
 bytes.writeUInt16LE(16,34);bytes.write("data",36);bytes.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(10000*Math.sin(i*2*Math.PI*262/sr)),p+i*2);
 return bytes;
}
let browser;
try{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({acceptDownloads:true});
 const failures=[];page.on("pageerror",e=>failures.push(String(e)));
 await page.goto("http://127.0.0.1:"+server.address().port+"/tools/local-sampler.html");
 await page.locator("#source").setInputFiles({name:"piano.wav",mimeType:"audio/wav",buffer:fixtureWav()});
 await page.locator("#run").click();
 assert.match(await page.locator("#status").innerText(),/使用権限/);
 await page.locator("#permission").check();
 await page.locator("#run").click();
 await page.locator("#result").waitFor({state:"visible",timeout:30000});
 assert.match(await page.locator("#details").innerText(),/30秒のガイド/);
 const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#download").click()]);
 const output=fs.readFileSync(await download.path());
 assert.equal(download.suggestedFilename(),"piano-asahi-guide.wav");
 assert.equal(output.readUInt32LE(24),24000);
 assert.equal(output.readUInt32LE(40)/2,32*24000);
 assert.ok(output.subarray(44+30*24000*2).every(x=>x===0));
 await page.locator("#mode").selectOption("single");
 await page.locator("#sfz").setInputFiles({name:"piano.sfz",mimeType:"text/plain",buffer:Buffer.from("<region> sample=piano.wav key=60 ampeg_attack=0.03 ampeg_release=0.2")});
 await page.locator("#run").click();
 await page.locator("#result").waitFor({state:"visible",timeout:30000});
 assert.match(await page.locator("#details").innerText(),/2秒のガイド/);
 assert.match(await page.locator("#details").innerText(),/演奏音符1個/);
 await page.locator("#sfz").setInputFiles({name:"bad.sfz",mimeType:"text/plain",buffer:Buffer.from("<region> sample=wrong.wav")});
 await page.locator("#run").click();
 await page.locator("#status").getByText(/ファイル名が違います/).waitFor({state:"visible",timeout:30000});
 assert.equal(await page.locator("#result").isVisible(),false);
 assert.deepEqual(failures,[]);
 console.log("PASS: local WAV → checked rights → 30-second sample-rendered guide → silent WAV → SFZ one-region → mismatch refusal");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
