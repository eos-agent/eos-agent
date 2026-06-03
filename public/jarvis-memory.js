// EOS JARVIS Memory System v4.1
// N198+N199+N200: Cerebro Conversacional + Voice Controller + Web Search
// v4.1: carga dinamicamente voice-controller.js y web-search-hook.js

(function() {
  'use strict';

  const SB_URL = localStorage.getItem('eos_supabase_url');
  const SB_KEY = localStorage.getItem('eos_supabase_anon') || localStorage.getItem('eos_supabase_key');
  const SESSION_ID = 'session_' + Date.now();

  if (!SB_URL || !SB_KEY) { console.warn('[JARVIS v4.1] Supabase keys not found'); return; }

  const sbHeaders = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };
  let _ctx = null, _ctxTime = 0;
  const CACHE_TTL = 5 * 60 * 1000;
  const STATE_KEY = 'eos_conv_state';

  function loadState() { try { return JSON.parse(sessionStorage.getItem(STATE_KEY)) || createFreshState(); } catch(e) { return createFreshState(); } }
  function createFreshState() { return { currentTopic: null, previousTopic: null, entities: [], objective: null, lastActions: [], turnCount: 0, sessionId: SESSION_ID }; }
  function saveState(s) { try { sessionStorage.setItem(STATE_KEY, JSON.stringify(s)); window.EOSConvState = s; } catch(e) {} }

  const KNOWN_ENTITIES = { 'ep':'EP Nea Arxi','nea arxi':'EP Nea Arxi','el ep':'EP Nea Arxi','el proyecto':'Proyecto EOS','eos':'Proyecto EOS','el documental':'Documental EOS','bogota':'Bogota/LATAM','latam':'Bogota/LATAM','estereo picnic':'Estereo Picnic','red bull':'Red Bull Music','spotify':'Spotify','instagram':'Instagram','tiktok':'TikTok','youtube':'YouTube','orkis':'Los 5 Orkis','jarvis':'Sistema JARVIS' };
  const TOPIC_PATTERNS = [
    { pattern: /(que.*hoy|agenda|plan.*dia|deberia hacer)/i, topic: 'agenda_diaria' },
    { pattern: /(ep|nea arxi|cancion|track|musica|album)/i, topic: 'ep_nea_arxi' },
    { pattern: /(oportunidad|festival|showcase|convocatoria)/i, topic: 'oportunidades' },
    { pattern: /(contenido|post|reel|video|tiktok|instagram)/i, topic: 'contenido' },
    { pattern: /(contacto|email|mensaje|outreach)/i, topic: 'networking' },
    { pattern: /(estrategia|posicionamiento|branding)/i, topic: 'estrategia' },
    { pattern: /(tarea|task|pendiente|deadline)/i, topic: 'tareas' },
    { pattern: /(meta|objetivo|goal|lograr)/i, topic: 'objetivos' },
    { pattern: /(tendencia|trend|viral|algoritmo)/i, topic: 'tendencias' },
    { pattern: /(competencia|otros artistas|mercado)/i, topic: 'competencia' }
  ];

  function detectEntities(text) { const lower=text.toLowerCase(); const found=[]; for(const [k,v] of Object.entries(KNOWN_ENTITIES)) { if(lower.includes(k)) found.push(v); } return [...new Set(found)]; }
  function detectTopic(text) { for(const {pattern,topic} of TOPIC_PATTERNS) { if(pattern.test(text)) return topic; } return null; }
  function updateState(userText) { const s=loadState(); const nt=detectTopic(userText); const ne=detectEntities(userText); if(nt&&nt!==s.currentTopic){s.previousTopic=s.currentTopic;s.currentTopic=nt;} s.entities=[...new Set([...s.entities,...ne])].slice(-15); s.turnCount++; saveState(s); return s; }

  async function loadContextFromSupabase() {
    const now=Date.now();
    if(_ctx&&(now-_ctxTime)<CACHE_TTL) return _ctx;
    try {
      const [identity,goals,tasks,decisions,convos,opportunities,contacts,events]=await Promise.all([
        fetch(SB_URL+'/rest/v1/eos_identity?limit=1',{headers:sbHeaders}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/goals?status=eq.active&limit=5&order=created_at.desc',{headers:sbHeaders}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/tasks?status=neq.completed&limit=8&order=due_date.asc',{headers:sbHeaders}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/decisions?order=created_at.desc&limit=6',{headers:sbHeaders}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/conversations?order=created_at.desc&limit=16',{headers:sbHeaders}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/opportunities?order=created_at.desc&limit=5',{headers:sbHeaders}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/contacts?limit=6&order=created_at.desc',{headers:sbHeaders}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/events?limit=4&order=created_at.desc',{headers:sbHeaders}).then(r=>r.json()).catch(()=>[])
      ]);
      _ctx={identity,goals,tasks,decisions,convos,opportunities,contacts,events};
      _ctxTime=now; window.EOSJarvisContext=_ctx;
      console.log('[JARVIS v4.1] Context: goals:'+goals.length+' tasks:'+tasks.length+' opps:'+opportunities.length);
      return _ctx;
    } catch(e) { console.warn('[JARVIS v4.1] Error:',e.message); return {identity:[],goals:[],tasks:[],decisions:[],convos:[],opportunities:[],contacts:[],events:[]}; }
  }

  window.buildSystemContext=function() {
    const ctx=window.EOSJarvisContext; if(!ctx) return '';
    const state=loadState(); const parts=[];
    if(ctx.identity&&ctx.identity[0]&&ctx.identity[0].system_role) parts.push('ROL DEL SISTEMA: '+ctx.identity[0].system_role);
    if(state.currentTopic||state.entities.length>0){parts.push('\nESTADO DE CONVERSACION:');if(state.currentTopic)parts.push('Tema: '+state.currentTopic);if(state.entities.length>0)parts.push('Entidades: '+state.entities.join(', '));if(state.turnCount>0)parts.push('Turno #'+state.turnCount);}
    if(ctx.goals&&ctx.goals.length>0){parts.push('\nOBJETIVOS ACTIVOS:');ctx.goals.forEach(g=>parts.push('- '+(g.title||g.goal||'')+(g.deadline?' ['+g.deadline+']':'')));}
    if(ctx.tasks&&ctx.tasks.length>0){parts.push('\nTAREAS PENDIENTES:');ctx.tasks.slice(0,5).forEach(t=>parts.push('- '+(t.title||t.task||t.description||'').substring(0,100)+(t.due_date?' [due:'+t.due_date+']':'')));}
    if(ctx.decisions&&ctx.decisions.length>0){const v=ctx.decisions.filter(d=>d.content&&d.content.trim().length>5);if(v.length>0){parts.push('\nDECISIONES RECIENTES:');v.slice(0,4).forEach(d=>parts.push('- '+d.content.substring(0,120)));}}
    if(ctx.opportunities&&ctx.opportunities.length>0){parts.push('\nOPORTUNIDADES:');ctx.opportunities.slice(0,3).forEach(o=>{const t=o.title||o.name||o.opportunity||'';if(t)parts.push('- '+t.substring(0,100));});}
    if(ctx.contacts&&ctx.contacts.length>0){const v=ctx.contacts.filter(c=>c.name||c.contact);if(v.length>0){parts.push('\nCONTACTOS:');v.slice(0,4).forEach(c=>parts.push('- '+(c.name||c.contact||'')+(c.organization?' ('+c.organization+')':'')));}}
    if(ctx.convos&&ctx.convos.length>0){const r=ctx.convos.slice(0,10).reverse();parts.push('\nCONVERSACION RECIENTE:');r.forEach(c=>parts.push('['+(c.role==='user'?'Usuario':'EOS')+']: '+(c.content||'').substring(0,200)));}
    if(ctx.events&&ctx.events.length>0){parts.push('\nEVENTOS:');ctx.events.slice(0,3).forEach(e=>{const t=e.title||e.name||'';if(t)parts.push('- '+t.substring(0,80)+(e.deadline?' ['+e.deadline+']':'')); });}
    if(ctx.webSearch){parts.push('\n'+ctx.webSearch);}
    return parts.length>0?'\n\n--- MEMORIA JARVIS v4.1 ---\n'+parts.join('\n')+'\n--- FIN MEMORIA ---':'';
  };

  async function saveConversation(role,content) {
    try { const r=await fetch(SB_URL+'/rest/v1/conversations',{method:'POST',headers:{...sbHeaders,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({role,content:content.substring(0,4000),session_id:SESSION_ID})}); if(r.ok) _ctxTime=0; } catch(e) {}
  }

  const DECISION_KEYWORDS=['decidimos','vamos a','la estrategia es','objetivo:','meta:','importante:','recordar','prioritario','next step','decided','we will','the plan','going to build','quiero que','hagamos','la vision','acordamos','definimos'];
  async function checkForDecisions(text) {
    const lower=text.toLowerCase(); const matched=DECISION_KEYWORDS.filter(k=>lower.includes(k));
    if(matched.length>0&&text.length>80){try{await fetch(SB_URL+'/rest/v1/decisions',{method:'POST',headers:{...sbHeaders,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({content:text.substring(0,500),category:'auto-learned',why:'Keywords: '+matched.join(', '),impact:'medium'})});}catch(e){}}
  }

  let lastAssistantText='',lastUserText='';

  function hookSendButton() {
    const btn=document.getElementById('floatSendBtn')||document.getElementById('mainSendBtn');
    const input=document.getElementById('floatChatInput')||document.getElementById('mainChatInput');
    if(!btn||!input){setTimeout(hookSendButton,1000);return;}
    const handleSend=()=>{const msg=input.value.trim();if(msg&&msg!==lastUserText){lastUserText=msg;updateState(msg);saveConversation('user',msg);}};
    btn.addEventListener('click',handleSend,true);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey)handleSend();},true);
    console.log('[JARVIS v4.1] Send hooked');
  }

  function observeChatOutput() {
    const selectors=['#chatHistory','#floatMessages','#chatMessages','#mainMessages','.chat-messages','.chat-output','.messages-container'];
    let container=null; for(const sel of selectors){const el=document.querySelector(sel);if(el){container=el;break;}}
    if(!container){setTimeout(observeChatOutput,2000);return;}
    const observer=new MutationObserver((mutations)=>{
      for(const mutation of mutations){
        for(const node of mutation.addedNodes){if(node.nodeType!==1)continue;const text=(node.textContent||node.innerText||'').trim();if(text.length<20)continue;const isUser=node.className&&(node.className.includes('user')||node.className.includes('human')||node.className.includes('you'));if(!isUser&&text!==lastAssistantText&&text!==lastUserText){lastAssistantText=text;saveConversation('assistant',text);checkForDecisions(text);}}
        if(mutation.type==='childList'){const target=mutation.target;if(!target||target.nodeType!==1)continue;const text=(target.textContent||'').trim();if(text.length>100&&text!==lastAssistantText&&text!==lastUserText){clearTimeout(target._saveTimer);target._saveTimer=setTimeout(()=>{if(text!==lastAssistantText){lastAssistantText=text;saveConversation('assistant',text);checkForDecisions(text);}},2000);}}
      }
    });
    observer.observe(container,{childList:true,subtree:true,characterData:true});
  }

  function loadScript(src) {
    return new Promise((resolve,reject)=>{
      if(document.querySelector('script[src="'+src+'"]')){resolve();return;}
      const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
    });
  }

  function showIndicator() {
    const div=document.createElement('div');
    div.style.cssText='position:fixed;bottom:60px;right:20px;z-index:99999;background:linear-gradient(135deg,#1a0000,#330000);border:1px solid #ff2200;border-radius:8px;padding:10px 16px;color:#ff4422;font-family:monospace;font-size:11px;letter-spacing:1px;font-weight:bold;box-shadow:0 0 20px rgba(255,34,0,0.4)';
    div.textContent='EOS JARVIS MEMORY v4.1 - ONLINE';
    document.body.appendChild(div);
    setTimeout(()=>{if(div.parentNode)div.parentNode.removeChild(div);},4000);
  }

  async function boot() {
    console.log('[JARVIS MEMORY v4.1] Booting...');
    await loadContextFromSupabase();
    hookSendButton();
    observeChatOutput();
    showIndicator();
    setInterval(loadContextFromSupabase,CACHE_TTL);
    window.EOSConvState=loadState();

    // Cargar voice-controller.js y web-search-hook.js dinamicamente
    setTimeout(async()=>{
      try { await loadScript('/public/voice-controller.js'); console.log('[JARVIS v4.1] Voice Controller loaded'); } catch(e) { console.warn('[JARVIS v4.1] Voice Controller load error:',e); }
      try { await loadScript('/public/web-search-hook.js'); console.log('[JARVIS v4.1] Web Search Hook loaded'); } catch(e) { console.warn('[JARVIS v4.1] Web Search Hook load error:',e); }
    }, 1000);

    console.log('[JARVIS MEMORY v4.1] Online | Session:', SESSION_ID);
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot);}else{boot();}
})();