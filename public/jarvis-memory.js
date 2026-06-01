// EOS JARVIS Memory System v3.0
// N195: Context Injection — EOS recuerda y aprende de cada conversación
// Strategy: defines buildSystemContext() which floatSend() already calls
// + DOM hook on send button for saving conversations
// + MutationObserver on #chatHistory for assistant responses

(function() {
  'use strict';

  const SB_URL = localStorage.getItem('eos_supabase_url');
  const SB_KEY = localStorage.getItem('eos_supabase_anon');
  const SESSION_ID = 'session_' + Date.now();

  if (!SB_URL || !SB_KEY) {
    console.warn('[JARVIS] Supabase keys not found — memory offline');
    return;
  }

  // ─── Context cache (refreshed every 5 min) ──────────────────────
  let _contextCache = null;
  let _contextCacheTime = 0;
  const CACHE_TTL = 5 * 60 * 1000;

  async function loadContextFromSupabase() {
    const now = Date.now();
    if (_contextCache && (now - _contextCacheTime) < CACHE_TTL) {
      return _contextCache;
    }

    try {
      const [identity, goals, decisions, convos] = await Promise.all([
        fetch(SB_URL + '/rest/v1/eos_identity?limit=1', {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
        }).then(r => r.json()).catch(() => []),

        fetch(SB_URL + '/rest/v1/goals?status=eq.active&limit=5&order=created_at.desc', {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
        }).then(r => r.json()).catch(() => []),

        fetch(SB_URL + '/rest/v1/decisions?order=created_at.desc&limit=8', {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
        }).then(r => r.json()).catch(() => []),

        fetch(SB_URL + '/rest/v1/conversations?order=created_at.desc&limit=20', {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
        }).then(r => r.json()).catch(() => [])
      ]);

      _contextCache = { identity, goals, decisions, convos };
      _contextCacheTime = now;
      window.EOSJarvisContext = _contextCache;

      console.log('[JARVIS v3] Context loaded — identity:', identity.length,
        '| goals:', goals.length, '| decisions:', decisions.length, '| convos:', convos.length);

      return _contextCache;
    } catch(e) {
      console.warn('[JARVIS v3] Context load error:', e.message);
      return { identity: [], goals: [], decisions: [], convos: [] };
    }
  }

  // ─── buildSystemContext — called automatically by floatSend() ────
  window.buildSystemContext = function() {
    const ctx = window.EOSJarvisContext;
    if (!ctx) return '';

    const parts = [];

    // Identity
    if (ctx.identity && ctx.identity.length > 0) {
      const id = ctx.identity[0];
      if (id.system_role) parts.push('ROL DEL SISTEMA: ' + id.system_role);
    }

    // Active goals
    if (ctx.goals && ctx.goals.length > 0) {
      parts.push('\nOBJETIVOS ACTIVOS:');
      ctx.goals.forEach(g => {
        parts.push('• ' + (g.title || g.goal) + (g.deadline ? ' [deadline: ' + g.deadline + ']' : ''));
      });
    }

    // Recent decisions
    if (ctx.decisions && ctx.decisions.length > 0) {
      parts.push('\nDECISIONES RECIENTES:');
      ctx.decisions.slice(0, 5).forEach(d => {
        parts.push('• ' + (d.content || d.decision || '').substring(0, 120));
      });
    }

    // Recent conversations (last 10, reversed to chronological order)
    if (ctx.convos && ctx.convos.length > 0) {
      const recent = ctx.convos.slice(0, 10).reverse();
      parts.push('\nCONVERSACIONES RECIENTES (contexto de sesiones anteriores):');
      recent.forEach(c => {
        const role = c.role === 'user' ? 'Usuario' : 'EOS';
        parts.push('[' + role + ']: ' + (c.content || '').substring(0, 200));
      });
    }

    return parts.length > 0 ? '\n\n--- MEMORIA JARVIS ---\n' + parts.join('\n') + '\n--- FIN MEMORIA ---' : '';
  };

  // ─── Supabase save helpers ───────────────────────────────────────
  async function saveConversation(role, content) {
    try {
      const r = await fetch(SB_URL + '/rest/v1/conversations', {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ role, content: content.substring(0, 4000), session_id: SESSION_ID })
      });
      if (r.ok) {
        // Invalidate cache so next call gets fresh convos
        _contextCacheTime = 0;
      }
    } catch(e) {
      console.warn('[JARVIS v3] Save failed:', e.message);
    }
  }

  async function saveDecision(content, keywords) {
    try {
      await fetch(SB_URL + '/rest/v1/decisions', {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          content: content.substring(0, 500),
          category: 'auto-learned',
          why: 'Auto-detectado de conversación — keywords: ' + keywords.join(', '),
          impact: 'medium'
        })
      });
    } catch(e) {}
  }

  // ─── Auto-learning keywords ──────────────────────────────────────
  const DECISION_KEYWORDS = [
    'decidimos', 'vamos a', 'la estrategia es', 'objetivo:', 'meta:',
    'importante:', 'recordar', 'prioritario', 'next step', 'decided',
    'we will', 'the plan', 'going to build', 'quiero que', 'hagamos',
    'la vision', 'el concepto', 'nuestra dirección'
  ];

  function checkForDecisions(text) {
    const lower = text.toLowerCase();
    const matched = DECISION_KEYWORDS.filter(k => lower.includes(k));
    if (matched.length > 0 && text.length > 80) {
      saveDecision(text, matched);
    }
  }

  // ─── Track last seen messages ────────────────────────────────────
  let lastAssistantText = '';
  let lastUserText = '';

  // ─── Hook send button (capture phase) ───────────────────────────
  function hookSendButton() {
    const btn = document.getElementById('floatSendBtn') || document.getElementById('mainSendBtn');
    const input = document.getElementById('floatChatInput') || document.getElementById('mainChatInput');

    if (!btn || !input) {
      setTimeout(hookSendButton, 1000);
      return;
    }

    btn.addEventListener('click', function() {
      const msg = input.value.trim();
      if (msg) {
        lastUserText = msg;
        saveConversation('user', msg);
        console.log('[JARVIS v3] Saved user:', msg.substring(0, 50));
      }
    }, true);

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        const msg = input.value.trim();
        if (msg) {
          lastUserText = msg;
          saveConversation('user', msg);
        }
      }
    }, true);

    console.log('[JARVIS v3] Send button hooked ✓');
  }

  // ─── Observe #chatHistory for assistant responses ────────────────
  function observeChatOutput() {
    const selectors = ['#chatHistory', '#floatMessages', '#chatMessages', '#mainMessages',
      '.chat-messages', '.chat-output', '.messages-container'];

    let container = null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { container = el; break; }
    }

    if (!container) {
      setTimeout(observeChatOutput, 2000);
      return;
    }

    console.log('[JARVIS v3] Observing:', container.id || container.className);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const text = (node.textContent || node.innerText || '').trim();
          if (text.length < 20) continue;

          const isUser = node.className && (
            node.className.includes('user') ||
            node.className.includes('human') ||
            node.className.includes('you')
          );

          if (!isUser && text !== lastAssistantText && text !== lastUserText) {
            lastAssistantText = text;
            saveConversation('assistant', text);
            checkForDecisions(text);
            console.log('[JARVIS v3] Saved assistant:', text.substring(0, 60));
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

  // ─── Visual indicator ────────────────────────────────────────────
  function showIndicator() {
    const div = document.createElement('div');
    div.id = 'eos-jarvis-indicator';
    div.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:99999',
      'background:linear-gradient(135deg,#1a0000,#330000)',
      'border:1px solid #ff2200', 'border-radius:8px',
      'padding:10px 16px', 'color:#ff4422', 'font-family:monospace',
      'font-size:12px', 'letter-spacing:1px', 'font-weight:bold',
      'box-shadow:0 0 20px rgba(255,34,0,0.4)',
      'animation:jarvisPulse 2s infinite'
    ].join(';');
    div.textContent = '⬡ EOS JARVIS MEMORY v3.0 — ONLINE';

    const style = document.createElement('style');
    style.textContent = '@keyframes jarvisPulse{0%,100%{box-shadow:0 0 20px rgba(255,34,0,0.4)}50%{box-shadow:0 0 30px rgba(255,34,0,0.8)}}';
    document.head.appendChild(style);
    document.body.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 3500);
  }

  // ─── Boot ────────────────────────────────────────────────────────
  async function boot() {
    console.log('[JARVIS MEMORY v3.0] Booting...');
    // Load context immediately so buildSystemContext() has data
    await loadContextFromSupabase();
    // Hook UI
    hookSendButton();
    observeChatOutput();
    showIndicator();
    console.log('[JARVIS MEMORY v3.0] Online ✓ | Session:', SESSION_ID);

    // Refresh context every 5 minutes
    setInterval(loadContextFromSupabase, CACHE_TTL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
