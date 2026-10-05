(async()=>{
  "use strict";
  try{
    const res=await fetch("./app-v10.3.2.html?v=1040",{cache:"no-store"});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    let html=await res.text();
    const inject='<script src="./v104-bootstrap.js?v=1040"></script><script src="./v104-reference-library.js?v=1040"></script>';
    if(/<\/body>/i.test(html))html=html.replace(/<\/body>/i,inject+'</body>');
    else html+=inject;
    document.open();document.write(html);document.close();
  }catch(err){
    document.body.innerHTML='<main style="font-family:system-ui;padding:24px"><h1>emuzii MUSIC STUDIO</h1><p>読み込みに失敗しました。ページを再読み込みしてください。</p><pre></pre></main>';
    const p=document.querySelector('pre');if(p)p.textContent=String(err?.message||err);
  }
})();
