(async()=>{
  "use strict";
  try{
    const res=await fetch("./app-v10.3.2.html?v=10915",{cache:"no-store"});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    let html=await res.text();
    const pre='<script src="./integration/asahi-project-reader.js?v=1202"></script>';
    const post='<script src="./v104-bootstrap.js?v=1043"></script><script src="./v104-reference-library.js?v=1043"></script>';
    if(/<\/head>/i.test(html))html=html.replace(/<\/head>/i,pre+'</head>'); else html=pre+html;
    if(/<\/body>/i.test(html))html=html.replace(/<\/body>/i,post+'</body>'); else html+=post;
    document.open();document.write(html);document.close();
  }catch(err){
    document.body.innerHTML='<main style="font-family:system-ui;padding:24px"><h1>emuzii MUSIC STUDIO</h1><p>読み込みに失敗しました。ページを再読み込みしてください。</p><pre></pre></main>';
    const p=document.querySelector('pre');if(p)p.textContent=String(err?.message||err);
  }
})();
