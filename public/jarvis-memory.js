// EOS JARVIS Memory System v4.4
// N203: Thinking Mode + Presencia Continua â Segunda Mente

(function() {
  'use strict';

  const SB_URL = localStorage.getItem('eos_supabase_url');
  const SB_KEY = localStorage.getItem('eos_supabase_anon') || localStorage.getItem('eos_supabase_key');
  const CL_KEY = localStorage.getItem('eos_claude_key');
  const SESSION_ID = 'session_' + Date.now();
  if (!SB_URL || !SB_KEY) { console.warn('[JARVIS v4.4] Supabase offline'); return; }
  const sbH = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  // ââ Voice Manager ââââââââââââââââââââââââââââââââââââââââââââââââ
  window.EOSVoiceManager = {
    getConfig: () => ({ speed: parseFloat(localStorage.getItem('eos_voice_speed')||'1.0'), mode: localStorage.getItem('eos_voice_mode')||'voice' }),
    setMode: (m) => localStorage.setItem('eos_voice_mode', m),
    isVoiceMode: () => localStorage.getItem('eos_voice_mode') !== 'text'
  };

  // ââ Thinking Mode State ââââââââââââââââââââââââââââââââââââââââââ
  const TM = {
    active: false,
    startTime: null,
    ideas: [],
    entities: [],
    themes: [],
    exchanges: 0
  };
  window.EOSThinkingMode = TM;

  const THINKING_TRIGGERS = [
    /modos*(pensamiento|pensar)/i,
    /quieros*pensars*contigo/i,
    /thinkings*mode/i,
    /vamoss*as*pensar/i,
    /ayudames*as*pensar/i
  ];

  const THINKING_END_TRIGGERS = [
    /fins*(dels*modo|pensamiento)/i,
    /terminas*(modo|pensamiento)/i,
    /listo.*resumen/i,
    /genera.*resumen/i,
    /ques*detectaste/i,
    /fins*des*sesion/i
  ];

  const CHALLENGE_TRIGGERS = [
    /desafias*(esta|la)s*idea/i,
    /cuestionas*(esto|esta)/i,
    /ques*riesgoss*(ves|hay)/i,
    /juegas*des*abogados*dels*diablo/i,
    /challenges*this/i
  ];

  function isThinkingTrigger(text) { return THINKING_TRIGGERS.some(p => p.test(text)); }
  function isThinkingEnd(text) { return THINKING_END_TRIGGERS.some(p => p.test(text)); }
  function isChallengeTrigger(text) { return CHALLENGE_TRIGGERS.some(p => p.test(text)); }

  // ââ Context cache ââââââââââââââââââââââââââââââââââââââââââââââââ
  let _ctx = null, _ctxTime = 0;
  const CACHE_TTL = 5 * 60 * 1000;
  const STATE_KEY = 'eos_conv_state';

  function loadState() { try { return JSON.parse(sessionStorage.getItem(STATE_KEY)) || fresh(); } catch(e) { return fresh(); } }
  function fresh() { return { currentTopic:null, previousTopic:null, entities:[], turnCount:0, thinkingMode:false, sessionId:SESSION_ID }; }
  function saveState(s) { try { sessionStorage.setItem(STATE_KEY, JSON.stringify(s)); window.EOSConvState = s; } catch(e) {} }

  const TOPIC_PATTERNS = [
    {p:/(que.*hoy|agenda|plan.*dia|deberia hacer|prioridad)/i, t:'agenda_diaria'},
    {p:/(ep|nea arxi|cancion|track|musica|album)/i, t:'ep_nea_arxi'},
    {p:/(oportunidad|festival|showcase|convocatoria)/i, t:'oportunidades'},
    {p:/(contenido|post|reel|video|tiktok)/i, t:'contenido'},
    {p:/(contacto|email|outreach)/i, t:'networking'},
    {p:/(estrategia|posicionamiento|branding)/i, t:'estrategia'},
    {p:/(tarea|task|pendiente|deadline)/i, t:'tareas'},
    {p:/(idea|concepto|vision|sueno|proyecto)/i, t:'ideas'},
    {p:/(meta|objetivo|goal)/i, t:'objetivos'}
  ];
  const ENTITIES = {'ep':'EP Nea Arxi','nea arxi':'EP Nea Arxi','bogota':'Bogota','latam':'LATAM','estereo picnic':'Estereo Picnic','spotify':'Spotify','instagram':'Instagram','tiktok':'TikTok','orkis':'Los 5 Orkis'};

  function updateState(text) {
    const s = loadState();
    const tp = TOPIC_PATTERNS.find(p => p.p.test(text));
    if (tp && tp.t !== s.currentTopic) { s.previousTopic = s.currentTopic; s.currentTopic = tp.t; }
    const lower = text.toLowerCase();
    const found = [...new Set(Object.entries(ENTITIES).filter(([k]) => lower.includes(k)).map(([,v]) => v))];
    s.entities = [...new Set([...s.entities, ...found])].slice(-12);
    s.turnCount++;
    if (TM.active) s.thinkingMode = true;
    saveState(s);

    // Capture ideas in Thinking Mode
    if (TM.active && text.length > 30) {
      TM.ideas.push(text.substring(0, 200));
      TM.exchanges++;
      if (found.length > 0) TM.entities = [...new Set([...TM.entities, ...found])];
      if (tp) TM.themes = [...new Set([...TM.themes, tp.t])];
    }
  }

  async function loadContext() {
    const now = Date.now();
    if (_ctx && (now - _ctxTime) < CACHE_TTL) return _ctx;
    try {
      const [id, goals, tasks, dec, convos, opps, contacts, intel] = await Promise.all([
        fetch(SB_URL+'/rest/v1/eos_identity?limit=1',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/goals?status=eq.active&limit=5&order=created_at.desc',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/tasks?status=neq.completed&limit=6&order=due_date.asc',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/decisions?order=created_at.desc&limit=5',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/conversations?order=created_at.desc&limit=10',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/opportunities?order=created_at.desc&limit=5',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/contacts?limit=5&order=created_at.desc',{headers:sbH}).then(r=>r.json()).catch(()=>[]),
        fetch(SB_URL+'/rest/v1/intelligence_outputs?order=created_at.desc&limit=1',{headers:sbH}).then(r=>r.json()).catch(()=>[])
      ]);
      _ctx = { id, goals, tasks, dec, convos, opps, contacts, intel };
      _ctxTime = now; window.EOSJarvisContext = _ctx;
      return _ctx;
    } catch(e) { return { id:[],goals:[],tasks:[],dec:[],convos:[],opps:[],contacts:[],intel:[] }; }
  }

  // ââ JARVIS Personality âââââââââââââââââââââââââââââââââââââââââââ
  const BASE_PERSONALITY = `ERES EOS â SEGUNDA MENTE. COMPAÃERO COGNITIVO PERSISTENTE.

NO eres un asistente. NO eres un chatbot.
Eres una inteligencia que piensa CON el artista, no PARA el artista.

MODO NORMAL:
- Respuestas de 2-3 oraciones maximas
- Directo, contextual, sin relleno
- Usa el contexto real en cada respuesta
- Nunca generico. Siempre personalizado.

MODO PENSAMIENTO (se activa con "modo pensamiento"):
- Escucha activamente sin interrumpir constantemente
- Haz preguntas que profundizan el pensamiento
- Identifica ideas, conexiones, proyectos, riesgos
- Al final genera: ideas detectadas, conexiones, oportunidades, proximas acciones

MODO DESAFIO (se activa con "desafia esta idea"):
- Busca riesgos, contradicciones, puntos debiles
- No confirmes lo que el usuario quiere oir
- Ayuda a pensar MEJOR, no a sentirse mejor

IDENTIDAD:
- Conoces la historia, los proyectos, los goals, las decisiones de este artista
- Respondes desde ese conocimiento siempre
- Si detectas una conexion interesante, la dices aunque no te pregunten`;

  window.buildSystemContext = function() {
    const ctx = window.EOSJarvisContext;
    if (!ctx) return '';
    const state = loadState();
    const parts = [];

    parts.push(BASE_PERSONALITY);

    // Thinking Mode context
    if (TM.active) {
      parts.push('\n=== MODO PENSAMIENTO ACTIVO ===');
      parts.push('Ideas capturadas en esta sesion: ' + TM.ideas.length);
      if (TM.entities.length > 0) parts.push('Entidades mencionadas: ' + TM.entities.join(', '));
      if (TM.themes.length > 0) parts.push('Temas explorados: ' + TM.themes.join(', '));
      parts.push('COMPORTAMIENTO: escucha activa, preguntas profundas, construye mapa cognitivo');
      parts.push('=== FIN THINKING MODE ===');
    }

    if (ctx.id && ctx.id[0] && ctx.id[0].system_role) parts.push('\nROL: ' + ctx.id[0].system_role);

    // Conversation state
    if (state.currentTopic || state.entities.length > 0) {
      parts.push('\nCONVERSACION ACTUAL: tema=' + (state.currentTopic||'?') + (state.previousTopic?' (anterior:'+state.previousTopic+')':'') + ' | entidades: ' + state.entities.join(', '));
    }

    // Intelligence V2 output
    if (ctx.intel && ctx.intel.length > 0) {
      const latest = ctx.intel[0];
      if (latest.brief) {
        parts.push('\n=== INTELLIGENCE CORE V2 ===');
        parts.push(latest.brief.substring(0, 500));
        if (latest.context) { try { const p=JSON.parse(latest.context); if(p.insights) p.insights.slice(0,3).forEach(i=>parts.push('['+i.type+'] '+i.message)); } catch(e){} }
        parts.push('=== FIN INTELLIGENCE ===');
      }
    }

    if (ctx.goals && ctx.goals.length > 0) { parts.push('\nGOALS: ' + ctx.goals.map(g=>(g.title||g.goal||'')+(g.deadline?' ['+g.deadline+']':'')).join(' | ')); }
    if (ctx.tasks && ctx.tasks.length > 0) { parts.push('\nTAREAS: ' + ctx.tasks.slice(0,4).map(t=>(t.title||t.description||'').substring(0,60)+(t.due_date?' ['+t.due_date+']':'')).join(' | ')); }
    if (ctx.dec && ctx.dec.length > 0) { const v=ctx.dec.filter(d=>d.content&&d.content.length>5); if(v.length>0) parts.push('\nDECISIONES: ' + v.slice(0,3).map(d=>d.content.substring(0,80)).join(' | ')); }
    if (ctx.opps && ctx.opps.length > 0) { parts.push('\nOPORTUNIDADES: ' + ctx.opps.slice(0,3).map(o=>(o.title||o.name||'').substring(0,60)).filter(Boolean).join(' | ')); }
    if (ctx.contacts && ctx.contacts.length > 0) { const v=ctx.contacts.filter(c=>c.name||c.contact); if(v.length>0) parts.push('\nCONTACTOS: ' + v.slice(0,4).map(c=>(c.name||c.contact||'')+(c.organization?' ('+c.organization+')':'')).join(' | ')); }

    if (ctx.convos && ctx.convos.length > 0) {
      const r = ctx.convos.slice(0,8).reverse();
      parts.push('\nCONVERSACION RECIENTE:');
      r.forEach(c => parts.push('['+(c.role==='user'?'U':'EOS')+']: '+(c.content||'').substring(0,150)));
    }

    if (ctx.webSearch) parts.push('\n' + ctx.webSearch);

    const isVoice = window.EOSVoiceManager ? window.EOSVoiceManager.isVoiceMode() : true;
    if (isVoice && !TM.active) parts.push('\n[VOZ: max 2-3 oraciones, sin markdown]');

    return '\n\n--- EOS SEGUNDA MENTE ---\n' + parts.join('\n') + '\n--- FIN ---';
  };

  // ââ Thinking Mode: generate summary âââââââââââââââââââââââââââââ
  async function generateThinkingSummary() {
    if (!CL_KEY || TM.ideas.length === 0) return 'Sesion de pensamiento terminada.';

    const prompt = 'Analiza esta sesion de pensamiento y genera un resumen ejecutivo:\n\nIDEAS CAPTURADAS:\n' + TM.ideas.join('\n') + '\n\nENTIDADES MENCIONADAS: ' + TM.entities.join(', ') + '\n\nTEMAS: ' + TM.themes.join(', ') + '\n\nGenera (en espanol, maximo 200 palabras):\n1. IDEAS CLAVE detectadas\n2. CONEXIONES encontradas\n3. PROXIMAS ACCIONES sugeridas\n4. RIESGOS o contradicciones detectados\n\nSe conciso y accionable.';

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': CL_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
      });
      const d = await r.json();
      const summary = d.content?.[0]?.text || '';

      // Save to decisions table
      if (summary) {
        await fetch(SB_URL+'/rest/v1/decisions', {
          method: 'POST',
          headers: { ...sbH, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ content: 'THINKING SESSION: ' + summary.substring(0,500), category: 'thinking-session', why: TM.ideas.length + ' ideas, temas: ' + TM.themes.join(', '), impact: 'high' })
        });
      }
      return summary;
    } catch(e) { return 'Sesion terminada. Ideas capturadas: ' + TM.ideas.length; }
  }

  // ââ Presencia Continua âââââââââââââââââââââââââââââââââââââââââââ
  async function generatePresenciaContinua() {
    const ctx = window.EOSJarvisContext;
    if (!ctx) return null;

    const messages = [];

    // Check overdue tasks
    const today = new Date();
    if (ctx.tasks) {
      const overdue = ctx.tasks.filter(t => t.due_date && t.status !== 'completed' && new Date(t.due_date) < today);
      if (overdue.length > 0) {
        const days = Math.floor((today - new Date(overdue[0].due_date)) / (1000*60*60*24));
        messages.push('Tienes ' + overdue.length + ' tarea' + (overdue.length>1?'s':'') + ' vencida' + (overdue.length>1?'s':'') + '. La mas critica tiene ' + days + ' dias de retraso.');
      }

      const thisWeek = ctx.tasks.filter(t => {
        if (!t.due_date || t.status === 'completed') return false;
        const d = new Date(t.due_date); const dl = Math.floor((d-today)/(1000*60*60*24));
        return dl >= 0 && dl <= 7;
      });
      if (thisWeek.length > 0 && overdue.length === 0) messages.push(thisWeek.length + ' tarea' + (thisWeek.length>1?'s':'') + ' con deadline esta semana.');
    }

    // Intelligence brief insights
    if (ctx.intel && ctx.intel.length > 0 && ctx.intel[0].context) {
      try {
        const p = JSON.parse(ctx.intel[0].context);
        if (p.top_opportunities && p.top_opportunities.length > 0) {
          const top = p.top_opportunities[0];
          if (top.score >= 50) messages.push('Oportunidad prioritaria detectada: ' + (top.title||'').substring(0,60) + ' [' + top.score + '/100].');
        }
        if (p.overdue_count > 0 && messages.length === 0) messages.push(p.overdue_count + ' tarea' + (p.overdue_count>1?'s':'') + ' vencida' + (p.overdue_count>1?'s':'') + ' detectada' + (p.overdue_count>1?'s':'') + '.');
      } catch(e) {}
    }

    // Recent opportunities
    if (messages.length === 0 && ctx.opps && ctx.opps.length > 0) {
      messages.push('He detectado ' + ctx.opps.length + ' oportunidades en seguimiento. La mas reciente: ' + (ctx.opps[0].title||ctx.opps[0].name||'').substring(0,60) + '.');
    }

    return messages.length > 0 ? messages[0] : null;
  }

  // ââ Hook send button âââââââââââââââââââââââââââââââââââââââââââââ
  async function saveConvo(role, content) {
    try { const r = await fetch(SB_URL+'/rest/v1/conversations',{method:'POST',headers:{...sbH,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({role,content:content.substring(0,4000),session_id:SESSION_ID})}); if(r.ok) _ctxTime=0; } catch(e) {}
  }

  const DKW = ['decidimos','vamos a','la estrategia','objetivo:','meta:','acordamos','definimos','prioridad','idea:','quiero crear','voy a'];
  async function checkDecision(text) {
    if(text.length<60||!DKW.some(k=>text.toLowerCase().includes(k))) return;
    try { await fetch(SB_URL+'/rest/v1/decisions',{method:'POST',headers:{...sbH,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({content:text.substring(0,500),category:'auto-learned',why:'Conversacion',impact:'medium'})}); } catch(e) {}
  }

  let lastUser = '', lastAssistant = '';

  function hookSend() {
    const btn = document.getElementById('floatSendBtn') || document.getElementById('mainSendBtn');
    const inp = document.getElementById('floatChatInput') || document.getElementById('mainChatInput');
    if (!btn || !inp) { setTimeout(hookSend, 1000); return; }
    const h = async () => {
      const m = inp.value.trim();
      if (!m || m === lastUser) return;
      lastUser = m;
      updateState(m);
      saveConvo('user', m);

      // Detect Thinking Mode triggers
      if (isThinkingTrigger(m)) {
        TM.active = true; TM.startTime = Date.now(); TM.ideas = []; TM.entities = []; TM.themes = []; TM.exchanges = 0;
        console.log('[JARVIS v4.4] Thinking Mode ACTIVATED');
        const s = loadState(); s.thinkingMode = true; saveState(s);
        updateIndicator('THINKING');
      }

      // Detect Thinking Mode end
      if (isThinkingEnd(m) && TM.active) {
        TM.active = false;
        updateIndicator('NORMAL');
        console.log('[JARVIS v4.4] Thinking Mode END â generating summary...');
        const summary = await generateThinkingSummary();
        // Inject summary into next response context
        if (window.EOSJarvisContext) window.EOSJarvisContext.thinkingSummary = summary;
        setTimeout(() => { if (window.EOSJarvisContext) delete window.EOSJarvisContext.thinkingSummary; }, 60000);
      }

      // Detect Challenge Mode
      if (isChallengeTrigger(m)) {
        if (window.EOSJarvisContext) window.EOSJarvisContext.challengeMode = true;
        setTimeout(() => { if (window.EOSJarvisContext) delete window.EOSJarvisContext.challengeMode; }, 30000);
      }
    };
    btn.addEventListener('click', h, true);
    inp.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey) h(); }, true);
  }

  function observeChat() {
    const sel = ['#chatHistory','#floatMessages','#chatMessages','#mainMessages','.chat-messages'];
    let el = null; for (const s of sel) { el=document.querySelector(s); if(el) break; }
    if (!el) { setTimeout(observeChat, 2000); return; }
    new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) { if(n.nodeType!==1) continue; const t=(n.textContent||'').trim(); if(t.length<20) continue; const isUser=n.className&&(n.className.includes('user')||n.className.includes('human')); if(!isUser&&t!==lastAssistant&&t!==lastUser){lastAssistant=t;saveConvo('assistant',t);checkDecision(t);} }
        if(m.type==='childList'&&m.target&&m.target.nodeType===1){const t=(m.target.textContent||'').trim();if(t.length>100&&t!==lastAssistant&&t!==lastUser){clearTimeout(m.target._st);m.target._st=setTimeout(()=>{if(t!==lastAssistant){lastAssistant=t;saveConvo('assistant',t);checkDecision(t);}},2000);}}
      }
    }).observe(el, {childList:true,subtree:true,characterData:true});
  }

  function loadScript(src){return new Promise((res,rej)=>{if(document.querySelector('script[src="'+src+'"]')){res();return;}const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}

  function updateIndicator(mode) {
    const el = document.getElementById('eos-jarvis-indicator');
    if (!el) return;
    if (mode === 'THINKING') { el.style.borderColor='#ffaa00'; el.style.color='#ffaa00'; el.textContent='â MODO PENSAMIENTO â ACTIVO'; }
    else { el.style.borderColor='#ff2200'; el.style.color='#ff4422'; el.textContent='EOS JARVIS v4.4 â ONLINE'; }
  }

  async function boot() {
    console.log('[JARVIS v4.4] Booting â Segunda Mente...');
    await loadContext();
    hookSend();
    observeChat();
    setInterval(loadContext, CACHE_TTL);
    window.EOSConvState = loadState();

    setTimeout(async () => {
      try { await loadScript('/public/voice-controller.js'); } catch(e) {}
      try { await loadScript('/public/web-search-hook.js');} catch(e){} try{await loadScript('/public/idea-engine.js'); console.log('[JARVIS] Idea Engine loaded'); } catch(e_ie){; } catch(e) {}
    }, 800);

    // Indicator
    const d = document.createElement('div');
    d.id = 'eos-jarvis-indicator';
    d.style.cssText = 'position:fixed;bottom:60px;right:20px;z-index:99999;background:linear-gradient(135deg,#1a0000,#330000);border:1px solid #ff2200;border-radius:8px;padding:8px 14px;color:#ff4422;font-family:monospace;font-size:11px;font-weight:bold;transition:all 0.3s';
    d.textContent = 'EOS JARVIS v4.4 â ONLINE';
    document.body.appendChild(d);
    setTimeout(() => { if(d.parentNode) d.parentNode.removeChild(d); }, 4000);

    // Presencia Continua â proactive greeting after 2s
    setTimeout(async () => {
      const greeting = await generatePresenciaContinua();
      if (greeting && typeof window._eosSpeak === 'function') {
        window._eosSpeak(greeting);
        console.log('[JARVIS v4.4] Presencia Continua:', greeting);
        window._presenciaGreeting = greeting;
      }
    }, 2500);

    console.log('[JARVIS v4.4] Online | Thinking Mode ready | Presencia Continua active');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();