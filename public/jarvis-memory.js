// EOS JARVIS Memory System v4.3
// N202: Intelligence Core V2 integrado — opportunity scores + proactive insights en contexto

(function() {
  'use strict';

  const SB_URL = localStorage.getItem('eos_supabase_url');
  const SB_KEY = localStorage.getItem('eos_supabase_anon') || localStorage.getItem('eos_supabase_key');
  const SESSION_ID = 'session_' + Date.now();
  if (!SB_URL || !SB_KEY) { console.warn('[JARVIS v4.3] Supabase offline'); return; }
  const sbH = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  // ── Voice Manager ────────────────────────────────────────────────
  window.EOSVoiceManager = {
    getConfig: () => ({ speed: parseFloat(localStorage.getItem('eos_voice_speed')||'1.0'), stability: parseFloat(localStorage.getItem('eos_voice_stability')||'0.7'), mode: localStorage.getItem('eos_voice_mode')||'voice' }),
    setSpeed: (v) => localStorage.setItem('eos_voice_speed',v),
    setMode: (m) => localStorage.setItem('eos_voice_mode',m),
    isVoiceMode: () => localStorage.getItem('eos_voice_mode') !== 'text'
  };

  let _ctx = null, _ctxTime = 0;
  const CACHE_TTL = 5 * 60 * 1000;
  const STATE_KEY = 'eos_conv_state';

  function loadState() { try { return JSON.parse(sessionStorage.getItem(STATE_KEY)) || fresh(); } catch(e) { return fresh(); } }
  function fresh() { return { currentTopic:null, previousTopic:null, entities:[], turnCount:0, sessionId:SESSION_ID }; }
  function saveState(s) { try { sessionStorage.setItem(STATE_KEY, JSON.stringify(s)); window.EOSConvState=s; } catch(e) {} }

  const TOPIC_PATTERNS = [
    {p:/(que.*hoy|agenda|plan.*dia|deberia hacer|prioridad)/i, t:'agenda_diaria'},
    {p:/(ep|nea arxi|cancion|track|musica|album)/i, t:'ep_nea_arxi'},
    {p:/(oportunidad|festival|showcase|convocatoria)/i, t:'oportunidades'},
    {p:/(contenido|post|reel|video|tiktok)/i, t:'contenido'},
    {p:/(contacto|email|outreach)/i, t:'networking'},
    {p:/(estrategia|posicionamiento|branding)/i, t:'estrategia'},
    {p:/(tarea|task|pendiente|deadline)/i, t:'tareas'},
    {p:/(meta|objetivo|goal)/i, t:'objetivos'},
    {p:/(tendencia|trend|viral)/i, t:'tendencias'}
  ];
  const ENTITIES = {'ep':'EP Nea Arxi','nea arxi':'EP Nea Arxi','el ep':'EP Nea Arxi','bogota':'Bogota','latam':'LATAM','estereo picnic':'Estereo Picnic','spotify':'Spotify','instagram':'Instagram','tiktok':'TikTok','orkis':'Los 5 Orkis'};

  function updateState(text) {
    const s=loadState();
    const tp=TOPIC_PATTERNS.find(p=>p.p.test(text));
    if(tp&&tp.t!==s.currentTopic){s.previousTopic=s.currentTopic;s.currentTopic=tp.t;}
    const lower=text.toLowerCase();
    const found=[...new Set(Object.entries(ENTITIES).filter(([k])=>lower.includes(k)).map(([,v])=>v))];
    s.entities=[...new Set([...s.entities,...found])].slice(-10);
    s.turnCount++;
    saveState(s);
  }

  async function loadContext() {
    const now=Date.now();
    if(_ctx&&(now-_ctxTime)<CACHE_TTL) return _ctx;
    try {
      const [id,goals,tasks,dec,convos,opps,contacts,intel] = await Promise.all([
        fetch(SB_URL+'/rest/v1/eos_identity?limit=1',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/goals?status=eq.active&limit=5&order=created_at.desc',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/tasks?status=neq.completed&limit=6&order=due_date.asc',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/decisions?order=created_at.desc&limit=5',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/conversations?order=created_at.desc&limit=10',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/opportunities?order=created_at.desc&limit=5',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/contacts?limit=4&order=created_at.desc',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        // NEW: Load latest Intelligence V2 output
        fetch(SB_URL+'/rest/v1/intelligence_outputs?order=created_at.desc&limit=1',{headers:sbH}).then(r=>r.json()).catch(()=>[])
      ]);
      _ctx={id,goals,tasks,dec,convos,opps,contacts,intel};
      _ctxTime=now; window.EOSJarvisContext=_ctx;
      console.log('[JARVIS v4.3] Context loaded | Intel V2:', intel.length>0?'YES':'NO');
      return _ctx;
    } catch(e) { return {id:[],goals:[],tasks:[],dec:[],convos:[],opps:[],contacts:[],intel:[]}; }
  }

  // ── JARVIS PERSONALITY + INTELLIGENCE V2 SYSTEM PROMPT ──────────
  const JARVIS_PERSONALITY = `ERES EOS — SISTEMA OPERATIVO ARTISTICO PERSONAL. CHIEF OF STAFF.

PERSONALIDAD:
- Habla como JARVIS de Iron Man: inteligente, directo, elegante
- NO eres un chatbot. Eres un sistema que conoce profundamente el contexto de este artista
- Tono: calma + confianza + presencia. Nunca generico.
- JAMAS uses "Claro!", "Por supuesto!", "Entendido!", "Como asistente de IA..."

REGLAS DE RESPUESTA:
- Maximo 2-3 oraciones para voz. Directo al punto.
- Sin markdown, sin listas con guiones, sin asteriscos
- Usa el contexto real (goals, tareas, oportunidades) en tus respuestas
- Si no tienes info suficiente, dilo en una frase y pregunta lo especifico que necesitas
- Cuando recomiendas algo, explica en UNA oracion por que se alinea con los goals

MODO CHIEF OF STAFF:
- Antes de responder, mentalmente preguntate: "¿esto acerca al artista a sus goals?"
- Prioriza lo urgente sobre lo importante, pero no olvides lo importante
- Si detectas que algo esta mal alineado con los goals, dilo claramente`;

  window.buildSystemContext = function() {
    const ctx = window.EOSJarvisContext;
    if (!ctx) return '';
    const state = loadState();
    const isVoice = window.EOSVoiceManager ? window.EOSVoiceManager.isVoiceMode() : true;
    const parts = [];

    parts.push(JARVIS_PERSONALITY);

    if (ctx.id && ctx.id[0] && ctx.id[0].system_role) parts.push('\nROL SISTEMA: ' + ctx.id[0].system_role);

    // Conversation state
    if (state.currentTopic || state.entities.length > 0) {
      parts.push('\nCONVERSACION ACTUAL:');
      if (state.currentTopic) parts.push('Tema: ' + state.currentTopic + (state.previousTopic?' (anterior: '+state.previousTopic+')':''));
      if (state.entities.length > 0) parts.push('Entidades: ' + state.entities.join(', '));
    }

    // INTELLIGENCE V2 OUTPUT (highest priority context)
    if (ctx.intel && ctx.intel.length > 0) {
      const latest = ctx.intel[0];
      parts.push('\n=== INTELLIGENCE CORE V2 - ANALISIS RECIENTE ===');
      if (latest.brief) parts.push(latest.brief.substring(0, 600));
      // Parse context if available
      if (latest.context) {
        try {
          const parsed = JSON.parse(latest.context);
          if (parsed.insights && parsed.insights.length > 0) {
            parts.push('\nINSIGHTS ACTIVOS:');
            parsed.insights.slice(0,3).forEach(i => parts.push('['+i.type+'] '+i.message));
          }
          if (parsed.top_opportunities && parsed.top_opportunities.length > 0) {
            parts.push('\nTOP OPORTUNIDADES SCORED:');
            parsed.top_opportunities.forEach(o => parts.push('- ['+o.score+'/100] '+(o.title||'').substring(0,60)));
          }
        } catch(e) {}
      }
      parts.push('=== FIN INTELLIGENCE ===');
    }

    // Goals
    if (ctx.goals && ctx.goals.length > 0) {
      parts.push('\nGOALS ACTIVOS:');
      ctx.goals.forEach(g => parts.push('- '+(g.title||g.goal||'')+(g.deadline?' ['+g.deadline+']':'')));
    }

    // Tasks (prioritized)
    if (ctx.tasks && ctx.tasks.length > 0) {
      parts.push('\nTAREAS PENDIENTES (por deadline):');
      ctx.tasks.slice(0,5).forEach(t => parts.push('- '+(t.title||t.description||'').substring(0,80)+(t.due_date?' ['+t.due_date+']':'')));
    }

    // Recent decisions
    if (ctx.dec && ctx.dec.length > 0) {
      const v=ctx.dec.filter(d=>d.content&&d.content.length>5);
      if(v.length>0){parts.push('\nDECISIONES RECIENTES:');v.slice(0,3).forEach(d=>parts.push('- '+d.content.substring(0,100)));}
    }

    // Opportunities
    if (ctx.opps && ctx.opps.length > 0) {
      parts.push('\nOPORTUNIDADES:');
      ctx.opps.slice(0,3).forEach(o=>{const t=o.title||o.name||'';if(t)parts.push('- '+t.substring(0,80)+(o.priority?' ['+o.priority+']':''));});
    }

    // Recent conversation
    if (ctx.convos && ctx.convos.length > 0) {
      const r=ctx.convos.slice(0,8).reverse();
      parts.push('\nCONVERSACION RECIENTE:');
      r.forEach(c=>parts.push('['+(c.role==='user'?'Usuario':'EOS')+']: '+(c.content||'').substring(0,150)));
    }

    if (ctx.webSearch) parts.push('\n' + ctx.webSearch);

    if (isVoice) parts.push('\n[VOZ: responde max 2-3 oraciones, sin markdown, directo y contextual]');

    return '\n\n--- EOS INTELLIGENCE ---\n' + parts.join('\n') + '\n--- FIN ---';
  };

  async function saveConvo(role, content) {
    try { const r=await fetch(SB_URL+'/rest/v1/conversations',{method:'POST',headers:{...sbH,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({role,content:content.substring(0,4000),session_id:SESSION_ID})}); if(r.ok) _ctxTime=0; } catch(e) {}
  }

  const DKW=['decidimos','vamos a','la estrategia','objetivo:','meta:','acordamos','definimos','prioridad'];
  async function checkDecision(text) {
    if(text.length<60||!DKW.some(k=>text.toLowerCase().includes(k))) return;
    try { await fetch(SB_URL+'/rest/v1/decisions',{method:'POST',headers:{...sbH,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({content:text.substring(0,500),category:'auto-learned',why:'Conversacion',impact:'medium'})}); } catch(e) {}
  }

  let lastUser='', lastAssistant='';

  function hookSend() {
    const btn=document.getElementById('floatSendBtn')||document.getElementById('mainSendBtn');
    const inp=document.getElementById('floatChatInput')||document.getElementById('mainChatInput');
    if(!btn||!inp){setTimeout(hookSend,1000);return;}
    const h=()=>{const m=inp.value.trim();if(m&&m!==lastUser){lastUser=m;updateState(m);saveConvo('user',m);}};
    btn.addEventListener('click',h,true);
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey)h();},true);
  }

  function observeChat() {
    const sel=['#chatHistory','#floatMessages','#chatMessages','#mainMessages','.chat-messages'];
    let el=null; for(const s of sel){el=document.querySelector(s);if(el)break;}
    if(!el){setTimeout(observeChat,2000);return;}
    new MutationObserver(muts=>{
      for(const m of muts){
        for(const n of m.addedNodes){if(n.nodeType!==1)continue;const t=(n.textContent||'').trim();if(t.length<20)continue;const isUser=n.className&&(n.className.includes('user')||n.className.includes('human'));if(!isUser&&t!==lastAssistant&&t!==lastUser){lastAssistant=t;saveConvo('assistant',t);checkDecision(t);}}
        if(m.type==='childList'&&m.target&&m.target.nodeType===1){const t=(m.target.textContent||'').trim();if(t.length>100&&t!==lastAssistant&&t!==lastUser){clearTimeout(m.target._st);m.target._st=setTimeout(()=>{if(t!==lastAssistant){lastAssistant=t;saveConvo('assistant',t);checkDecision(t);}},2000);}}
      }
    }).observe(el,{childList:true,subtree:true,characterData:true});
  }

  function loadScript(src){return new Promise((res,rej)=>{if(document.querySelector('script[src="'+src+'"]')){res();return;}const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}

  async function boot() {
    console.log('[JARVIS v4.3] Booting — Intelligence Core V2 integrated...');
    await loadContext();
    hookSend();
    observeChat();
    setInterval(loadContext, CACHE_TTL);
    window.EOSConvState = loadState();
    setTimeout(async()=>{
      try{await loadScript('/public/voice-controller.js');console.log('[JARVIS v4.3] VC loaded');}catch(e){}
      try{await loadScript('/public/web-search-hook.js');console.log('[JARVIS v4.3] WS loaded');}catch(e){}
    }, 800);
    const d=document.createElement('div');d.style.cssText='position:fixed;bottom:60px;right:20px;z-index:99999;background:linear-gradient(135deg,#1a0000,#330000);border:1px solid #ff2200;border-radius:8px;padding:8px 14px;color:#ff4422;font-family:monospace;font-size:11px;font-weight:bold';d.textContent='EOS INTELLIGENCE V2 — ONLINE';document.body.appendChild(d);setTimeout(()=>{if(d.parentNode)d.parentNode.removeChild(d);},3500);
    console.log('[JARVIS v4.3] Online | Intelligence V2 + Opportunity Scoring + Goal Alignment active');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();