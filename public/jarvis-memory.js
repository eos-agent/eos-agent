// EOS JARVIS Memory System v4.0
// N198: Cerebro Conversacional Persistente
// Upgrades sobre v3.0:
// + Conversation State Engine (topic, entities, objective, hilo)
// + Context Retrieval completo (tasks + opportunities + contacts + events)
// + Prioridad de contexto inteligente (8 fuentes ordenadas)
// + Topic threading entre turnos de conversación
// + Entity detection automática

(function() {
  'use strict';

  const SB_URL = localStorage.getItem('eos_supabase_url');
  const SB_KEY = localStorage.getItem('eos_supabase_anon') || localStorage.getItem('eos_supabase_key');
  const SESSION_ID = 'session_' + Date.now();

  if (!SB_URL || !SB_KEY) {
    console.warn('[JARVIS v4] Supabase keys not found — memory offline');
    return;
  }

  const sbHeaders = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  // ─── Context cache ────────────────────────────────────────────────
  let _ctx = null;
  let _ctxTime = 0;
  const CACHE_TTL = 5 * 60 * 1000;

  // ─── Conversation State Engine ────────────────────────────────────
  // Persiste en sessionStorage para mantener hilo dentro de sesión
  const STATE_KEY = 'eos_conv_state';

  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(STATE_KEY)) || createFreshState();
    } catch(e) { return createFreshState(); }
  }

  function createFreshState() {
    return {
      currentTopic: null,        // tema actual
      previousTopic: null,       // tema anterior
      entities: [],              // entidades mencionadas (EP, artistas, proyectos...)
      objective: null,           // objetivo de la conversación
      lastActions: [],           // últimas acciones recomendadas
      turnCount: 0,              // número de turnos en esta sesión
      sessionId: SESSION_ID
    };
  }

  function saveState(state) {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
      window.EOSConvState = state;
    } catch(e) {}
  }

  // ─── Entity & Topic Detection ─────────────────────────────────────
  const KNOWN_ENTITIES = {
    'ep': 'EP Νέα Αρχή',
    'νέα αρχή': 'EP Νέα Αρχή',
    'nea arxi': 'EP Νέα Αρχή',
    'nueva archi': 'EP Νέα Αρχή',
    'el ep': 'EP Νέα Αρχή',
    'las canciones': 'EP Νέα Αρχή',
    'el proyecto': 'Proyecto EOS',
    'eos': 'Proyecto EOS',
    'el documental': 'Documental EOS',
    'bogotá': 'Bogotá/LATAM',
    'latam': 'Bogotá/LATAM',
    'estéreo picnic': 'Estéreo Picnic',
    'red bull': 'Red Bull Music',
    'distrokid': 'DistroKid',
    'spotify': 'Spotify',
    'instagram': 'Instagram',
    'tiktok': 'TikTok',
    'youtube': 'YouTube',
    'los orkis': 'Los 5 Orkis',
    'orkis': 'Los 5 Orkis',
    'antigravity': 'Google Antigravity',
    'fish audio': 'Fish Audio TTS',
    'jarvis': 'Sistema JARVIS'
  };

  const TOPIC_PATTERNS = [
    { pattern: /(qué.*hoy|agenda|plan.*día|debería hacer)/i, topic: 'agenda_diaria' },
    { pattern: /(ep|νέα αρχή|canción|track|música|álbum)/i, topic: 'ep_nea_arxi' },
    { pattern: /(oportunidad|festival|showcase|convocatoria|colabor)/i, topic: 'oportunidades' },
    { pattern: /(contenido|post|reel|video|tiktok|instagram)/i, topic: 'contenido' },
    { pattern: /(contacto|email|mensaje|outreach|networkng)/i, topic: 'networking' },
    { pattern: /(estrategia|posicionamiento|branding|diferenciaci)/i, topic: 'estrategia' },
    { pattern: /(tarea|task|pendiente|deadline|entrega)/i, topic: 'tareas' },
    { pattern: /(meta|objetivo|goal|lograr|quiero)/i, topic: 'objetivos' },
    { pattern: /(tendencia|trend|viral|algoritmo|cultura)/i, topic: 'tendencias' },
    { pattern: /(competencia|otros artistas|mercado|posicion)/i, topic: 'competencia' }
  ];

  function detectEntities(text) {
    const lower = text.toLowerCase();
    const found = [];
    for (const [key, value] of Object.entries(KNOWN_ENTITIES)) {
      if (lower.includes(key)) found.push(value);
    }
    return [...new Set(found)];
  }

  function detectTopic(text) {
    for (const { pattern, topic } of TOPIC_PATTERNS) {
      if (pattern.test(text)) return topic;
    }
    return null;
  }

  function updateState(userText) {
    const state = loadState();
    const newTopic = detectTopic(userText);
    const newEntities = detectEntities(userText);

    if (newTopic && newTopic !== state.currentTopic) {
      state.previousTopic = state.currentTopic;
      state.currentTopic = newTopic;
    }

    // Merge entities without duplicates
    const allEntities = [...new Set([...state.entities, ...newEntities])];
    state.entities = allEntities.slice(-15); // keep last 15

    state.turnCount++;
    saveState(state);
    return state;
  }

  // ─── Full Context Retrieval (8 fuentes) ───────────────────────────
  async function loadContextFromSupabase() {
    const now = Date.now();
    if (_ctx && (now - _ctxTime) < CACHE_TTL) return _ctx;

    try {
      const [identity, goals, tasks, decisions, convos, opportunities, contacts, events] =
        await Promise.all([

          // 1. Identity
          fetch(SB_URL + '/rest/v1/eos_identity?limit=1', { headers: sbHeaders })
            .then(r => r.json()).catch(() => []),

          // 2. Goals activos
          fetch(SB_URL + '/rest/v1/goals?status=eq.active&limit=5&order=created_at.desc', { headers: sbHeaders })
            .then(r => r.json()).catch(() => []),

          // 3. Tasks activas (NUEVO)
          fetch(SB_URL + '/rest/v1/tasks?status=neq.completed&limit=8&order=due_date.asc', { headers: sbHeaders })
            .then(r => r.json()).catch(() => []),

          // 4. Decisiones recientes
          fetch(SB_URL + '/rest/v1/decisions?order=created_at.desc&limit=6', { headers: sbHeaders })
            .then(r => r.json()).catch(() => []),

          // 5. Conversaciones recientes
          fetch(SB_URL + '/rest/v1/conversations?order=created_at.desc&limit=16', { headers: sbHeaders })
            .then(r => r.json()).catch(() => []),

          // 6. Oportunidades top (NUEVO)
          fetch(SB_URL + '/rest/v1/opportunities?order=created_at.desc&limit=5', { headers: sbHeaders })
            .then(r => r.json()).catch(() => []),

          // 7. Contactos estratégicos (NUEVO)
          fetch(SB_URL + '/rest/v1/contacts?limit=6&order=created_at.desc', { headers: sbHeaders })
            .then(r => r.json()).catch(() => []),

          // 8. Eventos próximos (NUEVO)
          fetch(SB_URL + '/rest/v1/events?limit=4&order=created_at.desc', { headers: sbHeaders })
            .then(r => r.json()).catch(() => [])
        ]);

      _ctx = { identity, goals, tasks, decisions, convos, opportunities, contacts, events };
      _ctxTime = now;
      window.EOSJarvisContext = _ctx;

      console.log('[JARVIS v4] Context loaded:',
        'identity:', identity.length,
        '| goals:', goals.length,
        '| tasks:', tasks.length,
        '| decisions:', decisions.length,
        '| convos:', convos.length,
        '| opportunities:', opportunities.length,
        '| contacts:', contacts.length,
        '| events:', events.length
      );

      return _ctx;
    } catch(e) {
      console.warn('[JARVIS v4] Context load error:', e.message);
      return { identity:[], goals:[], tasks:[], decisions:[], convos:[], opportunities:[], contacts:[], events:[] };
    }
  }

  // ─── buildSystemContext (prioridad inteligente) ───────────────────
  // Llamado por floatSend() antes de cada mensaje a Claude
  window.buildSystemContext = function() {
    const ctx = window.EOSJarvisContext;
    if (!ctx) return '';

    const state = loadState();
    const parts = [];

    // ── IDENTIDAD ──
    if (ctx.identity && ctx.identity[0]) {
      const id = ctx.identity[0];
      if (id.system_role) parts.push('ROL DEL SISTEMA: ' + id.system_role);
    }

    // ── CONVERSATION STATE (hilo actual) ──
    if (state.currentTopic || state.entities.length > 0) {
      parts.push('\nESTADO DE CONVERSACIÓN:');
      if (state.currentTopic) parts.push('• Tema actual: ' + state.currentTopic);
      if (state.previousTopic) parts.push('• Tema anterior: ' + state.previousTopic);
      if (state.entities.length > 0) parts.push('• Entidades mencionadas: ' + state.entities.join(', '));
      if (state.turnCount > 0) parts.push('• Turno #' + state.turnCount + ' en esta sesión');
    }

    // ── OBJETIVOS ACTIVOS (prioridad 1) ──
    if (ctx.goals && ctx.goals.length > 0) {
      parts.push('\nOBJETIVOS ACTIVOS:');
      ctx.goals.forEach(g => {
        parts.push('• ' + (g.title || g.goal) + (g.deadline ? ' [deadline: ' + g.deadline + ']' : ''));
      });
    }

    // ── TAREAS ACTIVAS (prioridad 2) ──
    if (ctx.tasks && ctx.tasks.length > 0) {
      parts.push('\nTAREAS PENDIENTES:');
      ctx.tasks.slice(0, 5).forEach(t => {
        const due = t.due_date ? ' [due: ' + t.due_date + ']' : '';
        parts.push('• ' + (t.title || t.task || t.description || '').substring(0, 100) + due);
      });
    }

    // ── DECISIONES RECIENTES (prioridad 3) ──
    if (ctx.decisions && ctx.decisions.length > 0) {
      const validDecisions = ctx.decisions.filter(d => d.title && d.title.trim().length > 5);
      if (validDecisions.length > 0) {
        parts.push('\nDECISIONES RECIENTES:');
        validDecisions.slice(0, 4).forEach(d => {
          parts.push('• ' + d.title.substring(0, 120));
          if (d.description && d.description !== d.title) {
            parts.push('  → ' + d.description.substring(0, 100));
          }
        });
      }
    }

    // ── OPORTUNIDADES RECIENTES (prioridad 4) ──
    if (ctx.opportunities && ctx.opportunities.length > 0) {
      parts.push('\nOPORTUNIDADES DETECTADAS:');
      ctx.opportunities.slice(0, 3).forEach(o => {
        const title = o.title || o.name || o.opportunity || '';
        const priority = o.priority ? ' [' + o.priority + ']' : '';
        if (title) parts.push('• ' + title.substring(0, 100) + priority);
      });
    }

    // ── CONTACTOS ESTRATÉGICOS (prioridad 5) ──
    if (ctx.contacts && ctx.contacts.length > 0) {
      const validContacts = ctx.contacts.filter(c => c.name || c.contact);
      if (validContacts.length > 0) {
        parts.push('\nCONTACTOS CLAVE:');
        validContacts.slice(0, 4).forEach(c => {
          const name = c.name || c.contact || '';
          const org = c.organization || c.company || '';
          parts.push('• ' + name + (org ? ' (' + org + ')' : ''));
        });
      }
    }

    // ── CONVERSACIONES RECIENTES (contexto de sesión) ──
    if (ctx.convos && ctx.convos.length > 0) {
      const recent = ctx.convos.slice(0, 10).reverse();
      parts.push('\nCONVERSACIÓN RECIENTE:');
      recent.forEach(c => {
        const role = c.role === 'user' ? 'Usuario' : 'EOS';
        parts.push('[' + role + ']: ' + (c.content || '').substring(0, 200));
      });
    }

    // ── EVENTOS (si hay) ──
    if (ctx.events && ctx.events.length > 0) {
      parts.push('\nEVENTOS PRÓXIMOS:');
      ctx.events.slice(0, 3).forEach(e => {
        const title = e.title || e.name || '';
        const date = e.deadline || e.date || '';
        if (title) parts.push('• ' + title.substring(0, 80) + (date ? ' [' + date + ']' : ''));
      });
    }

    return parts.length > 0
      ? '\n\n--- MEMORIA JARVIS v4 ---\n' + parts.join('\n') + '\n--- FIN MEMORIA ---'
      : '';
  };

  // ─── Save conversation ────────────────────────────────────────────
  async function saveConversation(role, content) {
    try {
      const r = await fetch(SB_URL + '/rest/v1/conversations', {
        method: 'POST',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ role, content: content.substring(0, 4000), session_id: SESSION_ID })
      });
      if (r.ok) _ctxTime = 0; // invalidate cache
    } catch(e) { console.warn('[JARVIS v4] Save failed:', e.message); }
  }

  // ─── Auto-learning: save decisions ───────────────────────────────
  const DECISION_KEYWORDS = [
    // Español — decisiones explícitas
    'decidimos', 'decidí', 'tomamos la decisión', 'vamos a', 'voy a',
    'la estrategia es', 'la estrategia va a ser', 'acordamos', 'definimos',
    'quiero que', 'hagamos', 'el plan es', 'el enfoque es',
    // Español — intenciones fuertes
    'nuestra dirección', 'la visión', 'el concepto', 'la idea es',
    'lo que necesitamos', 'lo que vamos a hacer', 'prioritario',
    'es importante que', 'hay que', 'tenemos que', 'debemos',
    // Inglés
    'decided', 'we will', 'the plan', 'going to build', 'next step',
    'the strategy', 'the focus', 'we need to', 'important:',
    // Frases de EOS específicas
    'el ep', 'el single', 'la fecha', 'el lanzamiento', 'recordar que',
    'para el proyecto', 'para eos', 'el documental', 'meta:', 'objetivo:'
  ];

  async function checkForDecisions(text) {
    if (!text || text.length < 15) return;
    const lower = text.toLowerCase();
    const matched = DECISION_KEYWORDS.filter(k => lower.includes(k));
    if (matched.length > 0 && text.length > 60) {
      try {
        // Schema real: title, description, rationale, date_made
        const title = text.substring(0, 180).split('\n')[0].trim();
        await fetch(SB_URL + '/rest/v1/decisions', {
          method: 'POST',
          headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            title: title,
            description: text.substring(0, 500),
            rationale: 'Auto-detectado en conversación — keywords: ' + matched.join(', '),
            date_made: new Date().toISOString().split('T')[0]
          })
        });
        console.log('[JARVIS v4] Decision auto-saved ✓', title.substring(0, 60));
      } catch(e) { console.warn('[JARVIS v4] Decision save error:', e.message); }
    }
  }

  // ─── Track last seen ──────────────────────────────────────────────
  let lastAssistantText = '';
  let lastUserText = '';

  // ─── Hook send button ─────────────────────────────────────────────
  function hookSendButton() {
    const btn = document.getElementById('floatSendBtn') || document.getElementById('mainSendBtn');
    const input = document.getElementById('floatChatInput') || document.getElementById('mainChatInput');

    if (!btn || !input) { setTimeout(hookSendButton, 1000); return; }

    const handleSend = () => {
      const msg = input.value.trim();
      if (msg && msg !== lastUserText) {
        lastUserText = msg;
        updateState(msg); // update conversation state
        saveConversation('user', msg);
        checkForDecisions(msg); // ← FIX: detectar decisiones en mensajes del usuario
        console.log('[JARVIS v4] User saved + state updated:', msg.substring(0, 50));
      }
    };

    btn.addEventListener('click', handleSend, true);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); }, true);

    console.log('[JARVIS v4] Send button hooked ✓');
  }

  // ─── Observe chat output ──────────────────────────────────────────
  function observeChatOutput() {
    const selectors = ['#chatHistory', '#floatMessages', '#chatMessages', '#mainMessages',
      '.chat-messages', '.chat-output', '.messages-container'];
    let container = null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { container = el; break; }
    }
    if (!container) { setTimeout(observeChatOutput, 2000); return; }

    console.log('[JARVIS v4] Observing:', container.id || container.className);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const text = (node.textContent || node.innerText || '').trim();
          if (text.length < 20) continue;
          const isUser = node.className && (
            node.className.includes('user') || node.className.includes('human') || node.className.includes('you')
          );
          if (!isUser && text !== lastAssistantText && text !== lastUserText) {
            lastAssistantText = text;
            saveConversation('assistant', text);
            checkForDecisions(text);
          }
        }
        if (mutation.type === 'childList') {
          const target = mutation.target;
          if (!target || target.nodeType !== 1) continue;
          const text = (target.textContent || '').trim();
          if (text.length > 100 && text !== lastAssistantText && text !== lastUserText) {
            clearTimeout(target._saveTimer);
            target._saveTimer = setTimeout(() => {
              if (text !== lastAssistantText) {
                lastAssistantText = text;
                saveConversation('assistant', text);
                checkForDecisions(text);
              }
            }, 2000);
          }
        }
      }
    });

    observer.observe(container, { childList: true, subtree: true, characterData: true });
  }

  // ─── Visual indicator ─────────────────────────────────────────────
  function showIndicator() {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;bottom:60px;right:20px;z-index:99999;background:linear-gradient(135deg,#1a0000,#330000);border:1px solid #ff2200;border-radius:8px;padding:10px 16px;color:#ff4422;font-family:monospace;font-size:11px;letter-spacing:1px;font-weight:bold;box-shadow:0 0 20px rgba(255,34,0,0.4);animation:jarvisPulse 2s infinite';
    div.textContent = '⬡ EOS JARVIS MEMORY v4.0 — ONLINE';
    const style = document.createElement('style');
    style.textContent = '@keyframes jarvisPulse{0%,100%{box-shadow:0 0 20px rgba(255,34,0,0.4)}50%{box-shadow:0 0 35px rgba(255,34,0,0.9)}}';
    document.head.appendChild(style);
    document.body.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 4000);
  }

  // ─── Boot ─────────────────────────────────────────────────────────
  async function boot() {
    console.log('[JARVIS MEMORY v4.0] Booting — Cerebro Conversacional...');
    await loadContextFromSupabase();
    hookSendButton();
    observeChatOutput();
    showIndicator();
    setInterval(loadContextFromSupabase, CACHE_TTL);

    // Init conversation state
    const state = loadState();
    window.EOSConvState = state;
    console.log('[JARVIS MEMORY v4.0] Online ✓ | Session:', SESSION_ID,
      '| Context sources: 8 | State:', JSON.stringify(state).substring(0, 100));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
