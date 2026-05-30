// ── EOS INTELLIGENCE CORE PANEL v1.0 ──────────────────────────────────────
// Panel visual para el Intelligence Core — cerebro central de EOS Agent

(function() {
  'use strict';

  // ── INJECT STYLES ────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #intelligence-panel {
      display: none;
      flex-direction: column;
      gap: 20px;
      animation: fadeIn 0.4s ease;
    }
    #intelligence-panel.active { display: flex; }

    .intel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      background: linear-gradient(135deg, rgba(180,0,0,0.15), rgba(0,0,0,0.4));
      border: 1px solid rgba(180,0,0,0.3);
      border-radius: 12px;
      backdrop-filter: blur(10px);
    }
    .intel-header h2 {
      font-size: 1.4rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin: 0;
    }
    .intel-header h2 span { color: #b40000; }
    .intel-status {
      font-size: 0.75rem;
      color: #888;
      letter-spacing: 0.05em;
    }
    .intel-status.live { color: #00ff88; }

    .intel-run-btn {
      padding: 10px 22px;
      background: linear-gradient(135deg, #b40000, #ff2222);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      cursor: pointer;
      text-transform: uppercase;
      transition: all 0.2s;
    }
    .intel-run-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(180,0,0,0.5); }
    .intel-run-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .intel-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 768px) { .intel-grid { grid-template-columns: 1fr; } }

    .intel-card {
      background: rgba(10,10,10,0.8);
      border: 1px solid rgba(180,0,0,0.2);
      border-radius: 10px;
      padding: 18px 20px;
      backdrop-filter: blur(8px);
      transition: border-color 0.2s;
    }
    .intel-card:hover { border-color: rgba(180,0,0,0.5); }
    .intel-card-title {
      font-size: 0.7rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #b40000;
      margin-bottom: 12px;
      font-weight: 700;
    }
    .intel-card-body { color: #ccc; font-size: 0.9rem; line-height: 1.6; }

    .intel-priority {
      grid-column: 1 / -1;
      border-color: rgba(180,0,0,0.4);
      background: linear-gradient(135deg, rgba(180,0,0,0.08), rgba(0,0,0,0.6));
    }
    .intel-priority .intel-card-body {
      font-size: 1rem;
      color: #fff;
      font-weight: 500;
    }

    .intel-opp-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .intel-opp-item:last-child { border-bottom: none; }
    .intel-score {
      min-width: 44px;
      height: 44px;
      border-radius: 8px;
      background: rgba(180,0,0,0.15);
      border: 1px solid rgba(180,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      font-weight: 700;
      color: #ff4444;
    }
    .intel-score.high { background: rgba(180,0,0,0.3); border-color: rgba(180,0,0,0.6); color: #ff2222; }
    .intel-opp-title { font-size: 0.88rem; color: #ddd; font-weight: 600; }
    .intel-opp-desc { font-size: 0.78rem; color: #888; margin-top: 2px; }

    .intel-alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 0.85rem;
    }
    .intel-alert.HIGH {
      background: rgba(180,0,0,0.15);
      border: 1px solid rgba(180,0,0,0.4);
      color: #ff6666;
    }
    .intel-alert.MEDIUM {
      background: rgba(180,120,0,0.1);
      border: 1px solid rgba(180,120,0,0.3);
      color: #ffaa44;
    }
    .intel-alert-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .intel-alert.HIGH .intel-alert-dot { background: #ff2222; }
    .intel-alert.MEDIUM .intel-alert-dot { background: #ffaa44; }

    .intel-analysis {
      grid-column: 1 / -1;
      max-height: 300px;
      overflow-y: auto;
    }
    .intel-analysis .intel-card-body {
      font-size: 0.88rem;
      white-space: pre-wrap;
      font-family: inherit;
    }

    .intel-loading {
      text-align: center;
      padding: 40px;
      color: #666;
      font-size: 0.9rem;
      letter-spacing: 0.05em;
    }
    .intel-loading::after {
      content: '';
      animation: dots 1.5s infinite;
    }
    @keyframes dots {
      0%,20% { content: '.'; }
      40%,60% { content: '..'; }
      80%,100% { content: '...'; }
    }

    .intel-meta {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .intel-meta-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .intel-meta-label { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 0.1em; }
    .intel-meta-value { font-size: 1.1rem; font-weight: 700; color: #fff; }

    .intel-empty { color: #555; font-style: italic; font-size: 0.85rem; }
  `;
  document.head.appendChild(style);

  // ── INJECT PANEL HTML ─────────────────────────────────────────────────────
  function injectPanel() {
    // Find tab content area
    const tabContents = document.querySelector('.tab-contents, .content-area, main, #main-content, .dashboard-content');
    if (!tabContents) {
      // Try to find by looking for goals panel
      const goalsPanel = document.getElementById('goals-panel') || document.querySelector('[data-tab="goals"]');
      if (goalsPanel && goalsPanel.parentNode) {
        insertAfterElement(goalsPanel.parentNode.parentNode || goalsPanel.parentNode, createPanelEl());
      }
      return;
    }
    tabContents.appendChild(createPanelEl());
  }

  function createPanelEl() {
    const div = document.createElement('div');
    div.id = 'intelligence-panel';
    div.innerHTML = `
      <div class="intel-header">
        <div>
          <h2>⚡ <span>EOS</span> INTELLIGENCE CORE</h2>
          <div class="intel-status" id="intel-status-text">Listo para analizar</div>
        </div>
        <button class="intel-run-btn" id="intel-run-btn" onclick="window.runIntelligenceCore()">
          ◈ ANALIZAR AHORA
        </button>
      </div>

      <div id="intel-content">
        <div class="intel-card intel-priority">
          <div class="intel-card-title">◈ Prioridad #1 de hoy</div>
          <div class="intel-card-body intel-empty">Ejecuta el análisis para ver la prioridad del día →</div>
        </div>
      </div>
    `;
    return div;
  }

  // ── HOOK INTO NAVIGATION ──────────────────────────────────────────────────
  function hookNavigation() {
    // Listen for tab clicks that mention intelligence/intel
    document.addEventListener('click', function(e) {
      const el = e.target.closest('[data-tab], [onclicjJ="intelligence"], [onclicjJ="intel"], .nav-item, .sidebar-item, .tab-btn');
      if (!el) return;
      const tab = el.dataset.tab || el.getAttribute('onclick') || el.textContent;
      if (tab && (tab.toLowerCase().includes('intel') || tab.toLowerCase().includes('core'))) {
        showIntelPanel();
      }
    });

    // Also inject a nav button if sidebar exists
    setTimeout(injectNavButton, 500);
  }

  function injectNavButton() {
    // Look for existing nav items to clone style
    const navItems = document.querySelectorAll('.nav-item, .sidebar-item, .tab-btn, [data-tab]');
    if (navItems.length === 0) return;

    // Check if already injected
    if (document.getElementById('intel-nav-btn')) return;

    const lastItem = navItems[navItems.length - 1];
    const btn = document.createElement('button');
    btn.id = 'intel-nav-btn';
    btn.className = lastItem.className;
    btn.setAttribute('data-tab', 'intelligence');
    btn.innerHTML = `⚡ INTELLIGENCE`;
    btn.style.cssText = `border-left: 2px solid #b40000; color: #ff4444;`;
    btn.onclick = () => {
      // Deactivate others
      document.querySelectorAll('.nav-item.active, .sidebar-item.active, .tab-btn.active').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      // Hide other panels
      document.querySelectorAll('[id$="-panel"], .tab-content, [data-panel]').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
      });
      showIntelPanel();
    };
    lastItem.parentNode.insertBefore(btn, lastItem.nextSibling);
  }

  function showIntelPanel() {
    const panel = document.getElementById('intelligence-panel');
    if (panel) {
      panel.style.display = 'flex';
      panel.classList.add('active');
    }
  }

  // ── CORE LOGIC ────────────────────────────────────────────────────────────
  window.runIntelligenceCore = async function() {
    const btn = document.getElementById('intel-run-btn');
    const statusEl = document.getElementById('intel-status-text');
    const contentEl = document.getElementById('intel-content');

    if (btn) { btn.disabled = true; btn.textContent = '◈ ANALIZANDO...'; }
    if (statusEl) { statusEl.textContent = 'Consultando cerebro central...'; statusEl.className = 'intel-status live'; }
    if (contentEl) { contentEl.innerHTML = '<div class="intel-loading">Sintetizando inteligencia</div>'; }

    try {
      const claudeKey = localStorage.getItem('eos_claude_key');
      const supabaseUrl = localStorage.getItem('eos_supabase_url');
      const supabaseKey = localStorage.getItem('eos_supabase_key');
      const tgToken = localStorage.getItem('eos_tg_token');
      const tgChat = localStorage.getItem('eos_tg_chat');

      const headers = {
        'Content-Type': 'application/json',
        'x-claude-key': claudeKey || '',
        'x-supabase-url': supabaseUrl || '',
        'x-supabase-key': supabaseKey || '',
      };
      if (tgToken) headers['x-tg-token'] = tgToken;
      if (tgChat) headers['x-tg-chat'] = tgChat;

      const resp = await fetch('/api/intelligence', { method: 'POST', headers });
      const data = await resp.json();

      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

      renderIntelligence(data);
      if (statusEl) {
        statusEl.textContent = `Análisis completado · ${new Date().toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})}`;
        statusEl.className = 'intel-status live';
      }
    } catch (err) {
      if (contentEl) {
        contentEl.innerHTML = `
          <div class="intel-card intel-priority">
            <div class="intel-card-title">⚠ Error</div>
            <div class="intel-card-body" style="color:#ff6666">${err.message}</div>
          </div>
          <div class="intel-card" style="grid-column:1/-1">
            <div class="intel-card-title">Requisitos</div>
            <div class="intel-card-body intel-empty">Verifica que tengas configuradas: Claude API key, Supabase URL y Supabase key en Settings. También necesitas correr la migración SQL en Supabase (tablas eos_identity e intelligence_outputs).</div>
          </div>
        `;
      }
      if (statusEl) { statusEl.textContent = 'Error — revisa las keys'; statusEl.className = 'intel-status'; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '◈ ANALIZAR AHORA'; }
    }
  };

  function renderIntelligence(data) {
    const contentEl = document.getElementById('intel-content');
    if (!contentEl) return;

    const opps = (data.top_opportunities || []).slice(0, 5);
    const alerts = data.alerts || [];
    const conflicts = data.conflicts || [];
    const ctx = data.context_summary || {};

    contentEl.innerHTML = `
      <!-- PRIORITY #1 -->
      <div class="intel-card intel-priority" style="grid-column:1/-1">
        <div class="intel-card-title">◈ Prioridad #1 HOY</div>
        <div class="intel-card-body">${data.priority_one || 'Sin prioridad detectada'}</div>
      </div>

      <!-- META STATS -->
      <div class="intel-card" style="grid-column:1/-1">
        <div class="intel-card-title">◈ Contexto analizado</div>
        <div class="intel-meta">
          <div class="intel-meta-item"><div class="intel-meta-label">Objetivos</div><div class="intel-meta-value">${ctx.goals_count || 0}</div></div>
          <div class="intel-meta-item"><div class="intel-meta-label">Oportunidades</div><div class="intel-meta-value">${ctx.opportunities_analyzed || 0}</div></div>
          <div class="intel-meta-item"><div class="intel-meta-label">Ideas</div><div class="intel-meta-value">${ctx.ideas_analyzed || 0}</div></div>
          <div class="intel-meta-item"><div class="intel-meta-label">Tareas pendientes</div><div class="intel-meta-value">${ctx.tasks_pending || 0}</div></div>
          <div class="intel-meta-item"><div class="intel-meta-label">Alertas</div><div class="intel-meta-value" style="color:${(ctx.alerts_total||0)>0?'#ff4444':'#00ff88'}">${ctx.alerts_total || 0}</div></div>
          <div class="intel-meta-item"><div class="intel-meta-label">Identity loaded</div><div class="intel-meta-value" style="color:${ctx.identity_loaded?'#00ff88':'#ff4444'}">${ctx.identity_loaded ? '✓' : '✗'}</div></div>
        </div>
      </div>

      <!-- TOP OPPORTUNITIES -->
      <div class="intel-card">
        <div class="intel-card-title">◈ Top oportunidades rankeadas</div>
        <div class="intel-card-body">
          ${opps.length === 0 ? '<div class="intel-empty">Sin oportunidades en memoria</div>' :
            opps.map(op => `
              <div class="intel-opp-item">
                <div class="intel-score ${op.score >= 80 ? 'high' : ''}">${op.score}</div>
                <div>
                  <div class="intel-opp-title">${op.title || 'Sin título'}</div>
                  <div class="intel-opp-desc">${(op.description || '').slice(0, 80)}${(op.description||'').length > 80 ? '…' : ''}</div>
                </div>
              </div>`).join('')}
        </div>
      </div>

      <!-- ALERTS -->
      <div class="intel-card">
        <div class="intel-card-title">◈ Alertas detectadas</div>
        <div class="intel-card-body">
          ${alerts.length === 0 && conflicts.length === 0 ?
            '<div class="intel-empty">Sin alertas activas</div>' :
            [...alerts, ...conflicts.map(c => ({...c, urgency:'MEDIUM', message: c.reason}))].map(a => `
              <div class="intel-alert ${a.urgency || 'MEDIUM'}">
                <div class="intel-alert-dot"></div>
                <span>${a.message}</span>
              </div>`).join('')}
        </div>
      </div>

      <!-- STRATEGIC RECOMMENDATION -->
      <div class="intel-card" style="grid-column:1/-1">
        <div class="intel-card-title">◈ Recomendación estratégica</div>
        <div class="intel-card-body">${data.strategic_recommendation || '—'}</div>
      </div>

      <!-- FULL ANALYSIS -->
      <div class="intel-card intel-analysis">
        <div class="intel-card-title">◈ Análisis completo</div>
        <div class="intel-card-body">${data.full_analysis || '—'}</div>
      </div>
    `;
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init() {
    injectPanel();
    hookNavigation();

    // Also expose the panel via the existing EOS tab system if present
    const tabSystem = window.showTab || window.switchTab || window.activateTab;
    const origShowTab = window.showTab;
    if (origShowTab) {
      window.showTab = function(tabName) {
        origShowTab(tabName);
        const panel = document.getElementById('intelligence-panel');
        if (panel) {
          panel.style.display = tabName === 'intelligence' ? 'flex' : 'none';
          if (tabName === 'intelligence') panel.classList.add('active');
          else panel.classList.remove('active');
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }

})();
