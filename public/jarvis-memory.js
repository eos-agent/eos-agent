// EOS JARVIS Memory System v2.0
// DOM-based approach: hooks send button + observes chat output
// Works regardless of how the chat calls Anthropic internally

(function() {
  'use strict';

  const SB_URL = localStorage.getItem('eos_supabase_url');
  const SB_KEY = localStorage.getItem('eos_supabase_anon');
  const SESSION_ID = 'session_' + Date.now();

  if (!SB_URL || !SB_KEY) {
    console.warn('[JARVIS] Supabase keys not found — memory offline');
    return;
  }

  // ─── Supabase helpers ───────────────────────────────────────────
  async function saveConversation(role, content, context) {
    try {
      await fetch(SB_URL + '/rest/v1/conversations', {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ role, content, context: context || null, session_id: SESSION_ID })
      });
    } catch(e) {
      console.warn('[JARVIS] Save failed:', e.message);
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
          why: 'Auto-detected from conversation — keywords: ' + keywords.join(', '),
          impact: 'medium'
        })
      });
    } catch(e) {}
  }

  // ─── Auto-learning: detect decisions/ideas ──────────────────────
  const DECISION_KEYWORDS = [
    'decidimos', 'vamos a', 'la estrategia es', 'objetivo:', 'meta:',
    'importante:', 'recordar', 'prioritario', 'next step', 'decided',
    'we will', 'the plan', 'going to build', 'quiero que', 'hagamos'
  ];

  function checkForDecisions(text) {
    const lower = text.toLowerCase();
    const matched = DECISION_KEYWORDS.filter(k => lower.includes(k));
    if (matched.length > 0 && text.length > 80) {
      saveDecision(text, matched);
    }
  }

  // ─── Track last seen assistant message ─────────────────────────
  let lastAssistantText = '';
  let lastUserText = '';

  // ─── Hook send button ───────────────────────────────────────────
  function hookSendButton() {
    const btn = document.getElementById('floatSendBtn') || document.getElementById('mainSendBtn');
    const input = document.getElementById('floatChatInput') || document.getElementById('mainChatInput');

    if (!btn || !input) {
      setTimeout(hookSendButton, 1000);
      return;
    }

    // Intercept send
    btn.addEventListener('click', function() {
      const msg = input.value.trim();
      if (msg) {
        lastUserText = msg;
        saveConversation('user', msg);
        console.log('[JARVIS] Saved user message:', msg.substring(0, 50));
      }
    }, true); // capture phase = fires before existing handlers

    // Also capture Enter key
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        const msg = input.value.trim();
        if (msg) {
          lastUserText = msg;
          saveConversation('user', msg);
        }
      }
    }, true);

    console.log('[JARVIS] Send button hooked ✓');
  }

  // ─── Observe chat output for assistant responses ─────────────────
  function observeChatOutput() {
    // Common container selectors in EOS dashboard
    const selectors = [
      '#chatHistory', '#floatMessages', '#chatMessages', '#mainMessages',
      '.chat-messages', '.chat-output', '.messages-container',
      '[id*="message"]', '[class*="message"]'
    ];

    let container = null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { container = el; break; }
    }

    if (!container) {
      // Try to find any div that grows with chat content
      setTimeout(observeChatOutput, 2000);
      return;
    }

    console.log('[JARVIS] Observing chat output on:', container.id || container.className);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check for new nodes
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const text = node.textContent || node.innerText || '';
          if (text.length < 20) continue;

          // Detect if this is an assistant message (not user)
          const isUser = node.className && (
            node.className.includes('user') ||
            node.className.includes('human') ||
            node.className.includes('you')
          );

          if (!isUser && text !== lastAssistantText && text !== lastUserText) {
            lastAssistantText = text;
            saveConversation('assistant', text.substring(0, 4000));
            checkForDecisions(text);
            console.log('[JARVIS] Saved assistant message:', text.substring(0, 60));
          }
        }

        // Also check text changes
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          const target = mutation.target;
          if (!target || target.nodeType !== 1) continue;
          const text = target.textContent || '';
          if (text.length > 100 && text !== lastAssistantText && text !== lastUserText) {
            // Debounce streaming text
            clearTimeout(target._saveTimer);
            target._saveTimer = setTimeout(() => {
              if (text !== lastAssistantText) {
                lastAssistantText = text;
                saveConversation('assistant', text.substring(0, 4000));
                checkForDecisions(text);
              }
            }, 2000); // wait 2s for streaming to finish
          }
        }
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // ─── Load context from Supabase to inject into page ────────────
  async function loadContext() {
    try {
      const [identity, goals, decisions, convos] = await Promise.all([
        fetch(SB_URL + '/rest/v1/eos_identity?limit=1', {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
        }).then(r => r.json()).catch(() => []),

        fetch(SB_URL + '/rest/v1/goals?status=eq.active&limit=5', {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
        }).then(r => r.json()).catch(() => []),

        fetch(SB_URL + '/rest/v1/decisions?order=created_at.desc&limit=10', {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
        }).then(r => r.json()).catch(() => []),

        fetch(SB_URL + '/rest/v1/conversations?order=created_at.desc&limit=20', {
          headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
        }).then(r => r.json()).catch(() => [])
      ]);

      window.EOSJarvisContext = { identity, goals, decisions, convos };
      console.log('[JARVIS] Context loaded — identity:', identity.length, '| goals:', goals.length, '| decisions:', decisions.length, '| convos:', convos.length);
    } catch(e) {
      console.warn('[JARVIS] Context load error:', e.message);
    }
  }

  // ─── Visual indicator ──────────────────────────────────────────
  function showIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'eos-jarvis-indicator';
    indicator.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:99999',
      'background:linear-gradient(135deg,#1a0000,#330000)',
      'border:1px solid #ff2200', 'border-radius:8px',
      'padding:10px 16px', 'color:#ff4422', 'font-family:monospace',
      'font-size:12px', 'letter-spacing:1px', 'font-weight:bold',
      'box-shadow:0 0 20px rgba(255,34,0,0.4)',
      'animation:jarvisPulse 2s infinite'
    ].join(';');
    indicator.textContent = '⬡ EOS JARVIS MEMORY v2.0 — ONLINE';

    const style = document.createElement('style');
    style.textContent = '@keyframes jarvisPulse{0%,100%{box-shadow:0 0 20px rgba(255,34,0,0.4)}50%{box-shadow:0 0 30px rgba(255,34,0,0.8)}}';
    document.head.appendChild(style);
    document.body.appendChild(indicator);

    setTimeout(() => { if (indicator.parentNode) indicator.parentNode.removeChild(indicator); }, 3500);
  }

  // ─── Boot sequence ──────────────────────────────────────────────
  function boot() {
    console.log('[JARVIS MEMORY v2.0] Booting...');
    hookSendButton();
    observeChatOutput();
    loadContext();
    showIndicator();
    console.log('[JARVIS MEMORY v2.0] Online ✓ | Session:', SESSION_ID);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
