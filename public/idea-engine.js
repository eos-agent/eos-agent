// EOS Idea Engine v1.0
// N204: Auto-deteccion de ideas + similitud + conexiones con memoria
// Segunda Mente — gestiona ideas como un sistema cognitivo vivo

(function() {
  'use strict';

  const SB_URL = localStorage.getItem('eos_supabase_url');
  const SB_KEY = localStorage.getItem('eos_supabase_anon') || localStorage.getItem('eos_supabase_key');
  const CL_KEY = localStorage.getItem('eos_claude_key');
  if (!SB_URL || !SB_KEY) return;
  const sbH = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  // ── Idea detection patterns ──────────────────────────────────────
  const IDEA_PATTERNS = [
    /\b(idea:|idea es|tuve una idea|se me ocurrio|que tal si|podriamos|imagine|imaginate|vision:|concepto:)/i,
    /\b(quiero crear|voy a crear|podria ser|seria bueno|seria interesante)/i,
    /\b(y si hacemos|y si creamos|que pasaria si|propuesta:|proyecto nuevo)/i,
    /\b(pense en|estaba pensando|me imagino|lo que quiero hacer)/i
  ];

  const IDEA_MIN_LENGTH = 40;

  window.EOSIdeaEngine = {
    recentIdeas: [],
    lastCheck: 0
  };

  // ── Detect if text contains an idea ─────────────────────────────
  function isIdea(text) {
    if (text.length < IDEA_MIN_LENGTH) return false;
    return IDEA_PATTERNS.some(p => p.test(text));
  }

  // ── Extract idea title from text ─────────────────────────────────
  function extractIdeaTitle(text) {
    // Take first meaningful sentence
    const sentences = text.split(/[.!?]/);
    const first = sentences[0].trim();
    return first.length > 10 ? first.substring(0, 80) : text.substring(0, 80);
  }

  // ── Detect project from context ──────────────────────────────────
  function detectProject(text) {
    const lower = text.toLowerCase();
    if (lower.includes('ep') || lower.includes('nea arxi') || lower.includes('musica') || lower.includes('cancion')) return 'EP Nea Arxi';
    if (lower.includes('documental') || lower.includes('video') || lower.includes('cinemat')) return 'Documental EOS';
    if (lower.includes('contenido') || lower.includes('tiktok') || lower.includes('instagram') || lower.includes('reel')) return 'Contenido Digital';
    if (lower.includes('branding') || lower.includes('marca') || lower.includes('identidad')) return 'Branding EOS';
    return 'EOS General';
  }

  // ── Similarity check using keyword overlap ───────────────────────
  function calculateSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  // ── Find similar past ideas ──────────────────────────────────────
  async function findSimilarIdeas(newIdeaText) {
    try {
      const r = await fetch(SB_URL + '/rest/v1/ideas?order=created_at.desc&limit=50', { headers: sbH });
      const ideas = await r.json();
      if (!Array.isArray(ideas) || ideas.length === 0) return [];

      const similar = ideas
        .map(idea => ({
          ...idea,
          similarity: calculateSimilarity(newIdeaText, (idea.title || '') + ' ' + (idea.content || ''))
        }))
        .filter(idea => idea.similarity > 0.12) // threshold
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 2);

      return similar;
    } catch(e) { return []; }
  }

  // ── Save idea to Supabase ────────────────────────────────────────
  async function saveIdea(text, project) {
    const title = extractIdeaTitle(text);
    try {
      const r = await fetch(SB_URL + '/rest/v1/ideas', {
        method: 'POST',
        headers: { ...sbH, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({
          title: title,
          content: text.substring(0, 1000),
          type: 'auto-captured',
          status: 'new',
          project_id: null
        })
      });
      if (r.ok) {
        const saved = await r.json();
        console.log('[IdeaEngine] Saved idea:', title.substring(0, 50));
        window.EOSIdeaEngine.recentIdeas.unshift({ title, text, project, savedAt: Date.now() });
        window.EOSIdeaEngine.recentIdeas = window.EOSIdeaEngine.recentIdeas.slice(0, 10);
        return saved[0] || { title };
      }
    } catch(e) { console.warn('[IdeaEngine] Save error:', e.message); }
    return null;
  }

  // ── Show idea notification ────────────────────────────────────────
  function showIdeaNotification(message, type) {
    const old = document.getElementById('idea-notification');
    if (old) old.remove();

    const div = document.createElement('div');
    div.id = 'idea-notification';
    const colors = {
      saved: { border: '#00ff88', text: '#00ff88', bg: '#001a0a' },
      similar: { border: '#ffaa00', text: '#ffaa00', bg: '#1a1000' },
      connection: { border: '#0088ff', text: '#00aaff', bg: '#000a1a' }
    };
    const c = colors[type] || colors.saved;
    div.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:99999;background:' + c.bg + ';border:1px solid ' + c.border + ';border-radius:10px;padding:10px 18px;color:' + c.text + ';font-family:monospace;font-size:11px;max-width:65%;text-align:center;letter-spacing:0.5px;animation:ideaPulse 0.3s ease';
    div.textContent = message;

    const style = document.createElement('style');
    style.textContent = '@keyframes ideaPulse{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(style);
    document.body.appendChild(div);
    setTimeout(() => { if(div.parentNode) div.parentNode.removeChild(div); }, 5000);
  }

  // ── Process message for ideas ────────────────────────────────────
  async function processForIdeas(text) {
    if (!isIdea(text)) return;

    // Throttle: don't process more than 1 idea per 30s
    const now = Date.now();
    if (now - window.EOSIdeaEngine.lastCheck < 30000) return;
    window.EOSIdeaEngine.lastCheck = now;

    const project = detectProject(text);

    // Find similar ideas first
    const similar = await findSimilarIdeas(text);

    // Save the new idea
    const saved = await saveIdea(text, project);

    if (saved) {
      showIdeaNotification('◈ Idea capturada: ' + saved.title.substring(0, 50), 'saved');

      // If similar ideas found, notify
      if (similar.length > 0) {
        const simDate = similar[0].created_at ? new Date(similar[0].created_at).toLocaleDateString('es-CO') : '';
        setTimeout(() => {
          showIdeaNotification(
            'Conexion detectada: idea similar del ' + simDate + ' — "' + (similar[0].title || '').substring(0, 50) + '"',
            'similar'
          );
          // Inject similarity into context for EOS to mention
          if (window.EOSJarvisContext) {
            window.EOSJarvisContext.ideaConnection = {
              newIdea: saved.title,
              similarIdea: similar[0].title,
              similarDate: simDate
            };
            setTimeout(() => { if(window.EOSJarvisContext) delete window.EOSJarvisContext.ideaConnection; }, 45000);
          }
          console.log('[IdeaEngine] Similar idea found:', similar[0].title);
        }, 5500);
      }

      // Add to EOS context
      if (window.EOSJarvisContext) {
        window.EOSJarvisContext.lastCapturedIdea = { title: saved.title, project };
        setTimeout(() => { if(window.EOSJarvisContext) delete window.EOSJarvisContext.lastCapturedIdea; }, 60000);
      }
    }
  }

  // ── Hook into floatSend ──────────────────────────────────────────
  function hookIdeaDetection() {
    const originalFloatSend = window.floatSend;
    if (!originalFloatSend) { setTimeout(hookIdeaDetection, 1000); return; }

    window.floatSend = async function(text) {
      // Process for ideas in background
      setTimeout(() => processForIdeas(text), 500);
      return originalFloatSend(text);
    };
    console.log('[IdeaEngine] Hooked into floatSend');
  }

  // ── Also watch chat input for ideas ──────────────────────────────
  function watchChatInput() {
    const inp = document.getElementById('floatChatInput') || document.getElementById('mainChatInput');
    if (!inp) { setTimeout(watchChatInput, 1000); return; }
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const text = inp.value.trim();
        if (text.length > IDEA_MIN_LENGTH) setTimeout(() => processForIdeas(text), 600);
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────
  window.EOSIdeaEngine.processText = processForIdeas;
  window.EOSIdeaEngine.findSimilar = findSimilarIdeas;
  window.EOSIdeaEngine.save = saveIdea;

  // ── Boot ──────────────────────────────────────────────────────────
  function boot() {
    console.log('[EOS Idea Engine v1.0] Booting...');
    setTimeout(() => { hookIdeaDetection(); watchChatInput(); console.log('[EOS Idea Engine v1.0] Online'); }, 1500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();