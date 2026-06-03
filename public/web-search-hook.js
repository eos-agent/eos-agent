// EOS Web Search Hook v1.0
(function() {
  'use strict';
  const TAVILY_URL = 'https://api.tavily.com/search';
  function getTavilyKey() { return localStorage.getItem('eos_tavily_key'); }
  const SEARCH_TRIGGERS = [/busca|investiga|encuentra|search|googlea/i,/tendencia|trending|viral|nuevo|reciente|hoy/i,/noticias|festival|convocatoria|open call|showcase/i,/artista|musico|album|cancion.*nueva|lanzamiento/i,/spotify|youtube|tiktok.*tendencia/i,/cultura|escena musical|bogota.*musica|latam/i];
  function needsWebSearch(text) { if(!text||text.length<15) return false; return SEARCH_TRIGGERS.some(p=>p.test(text)); }
  async function searchWeb(query) {
    const key=getTavilyKey(); if(!key) return null;
    try { const r=await fetch(TAVILY_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:key,query:query+' musica Colombia LATAM 2026',search_depth:'basic',max_results:3,include_answer:true})}); if(!r.ok) return null; return await r.json(); } catch(e) { return null; }
  }
  function formatResults(data,query) {
    if(!data) return null;
    const parts=['[BUSQUEDA WEB]','Query: '+query,'Fecha: '+new Date().toLocaleDateString('es-CO')];
    if(data.answer) parts.push('Respuesta: '+data.answer.substring(0,300));
    if(data.results) data.results.slice(0,3).forEach((r,i)=>{parts.push((i+1)+'. '+(r.title||'').substring(0,80));if(r.content)parts.push('   '+r.content.substring(0,200));});
    parts.push('[FIN BUSQUEDA]');
    return parts.join('\n');
  }
  function showIndicator(query) {
    const old=document.getElementById('ws-ind');if(old)old.remove();
    const d=document.createElement('div');d.id='ws-ind';d.style.cssText='position:fixed;top:70px;right:20px;z-index:99999;background:#001a33;border:1px solid #0088ff;border-radius:8px;padding:8px 14px;color:#00aaff;font-family:monospace;font-size:11px;font-weight:bold';
    d.textContent='BUSCANDO: '+query.substring(0,40)+'...';document.body.appendChild(d);
    return ()=>{if(d.parentNode)d.parentNode.removeChild(d);};
  }
  function hookFloatSend() {
    if(!window.floatSend){setTimeout(hookFloatSend,500);return;}
    const _orig=window.floatSend;
    window.floatSend=async function(text){
      if(!text||!getTavilyKey()||!needsWebSearch(text)) return _orig(text);
      const hide=showIndicator(text);
      try { const r=await searchWeb(text); hide(); if(r){const f=formatResults(r,text);if(window.EOSJarvisContext){window.EOSJarvisContext.webSearch=f;}const _ob=window.buildSystemContext;window.buildSystemContext=function(){return (_ob?_ob():'')+( window.EOSJarvisContext&&window.EOSJarvisContext.webSearch?'\n\n'+window.EOSJarvisContext.webSearch:'');};setTimeout(()=>{if(window.EOSJarvisContext)window.EOSJarvisContext.webSearch=null;},30000);} } catch(e){hide();}
      return _orig(text);
    };
    console.log('[EOS WebSearch v1.0] Active');
  }
  function boot() { if(!getTavilyKey()) console.warn('[WebSearch] Set eos_tavily_key'); hookFloatSend(); window.EOSWebSearch={search:searchWeb,needsSearch:needsWebSearch}; }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot);}else{boot();}
})();