// EOS Agent — Orchestrator v2.0
// Coordina Scout → Trends → Competitive Intel → Intelligence Core → Notify → Brief
// El cerebro que conecta todos los agentes de EOS

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-claude-key, x-tavily-key, x-supabase-url, x-supabase-key, x-telegram-token, x-telegram-chat-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const CLAUDE    = req.headers['x-claude-key'];
  const TAVILY    = req.headers['x-tavily-key'];
  const SB_URL    = req.headers['x-supabase-url'];
  const SB_KEY    = req.headers['x-supabase-key'];
  const TG_TOKEN  = req.headers['x-telegram-token'];
  const TG_CHAT   = req.headers['x-telegram-chat-id'];

  if (!CLAUDE || !TAVILY) {
    return res.status(400).json({ error: 'Missing Claude or Tavily keys' });
  }

  const BASE = 'https://eos-agent.vercel.app';

  // ── Fetch active goals for context ─────────────────────────────────────
  let activeGoals = [];
  if (SB_URL && SB_KEY) {
    try {
      const gr = await fetch(SB_URL + '/rest/v1/goals?status=eq.active&order=priority.desc&limit=10', {
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
      });
      if (gr.ok) activeGoals = await gr.json();
    } catch(e) { console.error('[Orchestrator] Goals fetch failed:', e.message); }
  }

  const results = { started_at: new Date().toISOString(), agents: {} };
  const errors = [];

  // Helper: call internal agent
  async function runAgent(name, path, extraHeaders = {}) {
    try {
      const r = await fetch(BASE + path, {
        headers: {
          'x-claude-key': CLAUDE,
          'x-tavily-key': TAVILY,
          'x-supabase-url': SB_URL || '',
          'x-supabase-key': SB_KEY || '',
          'x-telegram-token': TG_TOKEN || '',
          'x-telegram-chat-id': TG_CHAT || '',
          ...extraHeaders
        }
      });
      const data = await r.json();
      results.agents[name] = { success: data.success !== false, ...data };
      return data;
    } catch(e) {
      errors.push(name + ': ' + e.message);
      results.agents[name] = { success: false, error: e.message };
      return null;
    }
  }

  // ── FASE 1: Scout — detecta oportunidades ──────────────────────────────
  console.log('[Orchestrator] Phase 1: Scout');
  const scoutData = await runAgent('scout', '/api/scout');
  await new Promise(r => setTimeout(r, 1500));

  // ── FASE 2: Trends — analiza tendencias culturales ─────────────────────
  console.log('[Orchestrator] Phase 2: Trends');
  const trendsData = await runAgent('trends', '/api/trends');
  await new Promise(r => setTimeout(r, 1500));

  // ── FASE 3: Competitive Intelligence ───────────────────────────────────
  console.log('[Orchestrator] Phase 3: Competitive Intel');
  const intelData = await runAgent('competitive', '/api/competitive');
  await new Promise(r => setTimeout(r, 1500));

  // ── FASE 4: Intelligence Core — cerebro estratégico de EOS ─────────────
  // Fire-and-forget: el Intelligence Core toma ~60s (Claude + 10 tablas Supabase)
  // Corre en paralelo — no bloqueamos el orchestrator esperando su respuesta
  console.log('[Orchestrator] Phase 4: Intelligence Core (async fire-and-forget)');
  if (SB_URL && SB_KEY) {
    try {
      fetch(BASE + '/api/intelligence', {
        headers: {
          'x-claude-key': CLAUDE,
          'x-supabase-url': SB_URL,
          'x-supabase-key': SB_KEY,
          'x-tg-token': TG_TOKEN || '',
          'x-tg-chat': TG_CHAT || ''
        }
      }).then(r => {
        console.log('[Orchestrator] Intelligence Core triggered, status:', r.status);
      }).catch(e => {
        console.error('[Orchestrator] Intelligence Core fire error:', e.message);
      });
      results.agents['intelligence'] = { success: true, status: 'triggered_async', note: 'Running in background — saves to Supabase intelligence_outputs + Telegram' };
    } catch(e) {
      errors.push('intelligence_trigger: ' + e.message);
      results.agents['intelligence'] = { success: false, error: e.message };
    }
  } else {
    results.agents['intelligence'] = { success: false, error: 'Missing Supabase keys' };
  }
  await new Promise(r => setTimeout(r, 500));

  // ── FASE 5: Notify — alertas Telegram para opps críticas ───────────────
  let notifyData = null;
  if (TG_TOKEN && TG_CHAT && SB_URL && SB_KEY) {
    console.log('[Orchestrator] Phase 5: Telegram Notify');
    notifyData = await runAgent('notify', '/api/notify');
    await new Promise(r => setTimeout(r, 800));
  }

  // ── FASE 6: Brief final con Claude ─────────────────────────────────────
  console.log('[Orchestrator] Phase 6: Generating intelligence brief');
  let brief = null;
  try {
    const scoutSummary = scoutData?.opps > 0
      ? scoutData.opps + ' oportunidades detectadas'
      : 'Sin nuevas oportunidades esta sesión';

    const trendsSummary = trendsData?.trends?.slice(0,3).map(t => t.title || t).join(', ') || 'Análisis completado';

    const intelSummary = intelData?.analysis?.eos_differentiation?.unique_position || 'Análisis completado';

    const gaps = intelData?.analysis?.market_gaps?.filter(g => g.priority === 'critical' || g.priority === 'high').slice(0,2) || [];

    const briefPrompt = `Eres EOS Agent, el sistema de inteligencia artística de EOS (Νέα Αρχή).
Genera un brief de inteligencia diario conciso, estratégico y cinematográfico.

OBJETIVOS ACTIVOS DE EOS (
${activeGoals.length > 0 ? activeGoals.map(g => '- [' + g.priority.toUpperCase() + '] ' + g.title + (g.description ? ': ' + g.description.substring(0,80) : '')).join('\n') : 'Sin objetivos registrados aún'}

DATOS DEL SISTEMA HOY:
- Scout: ${scoutSummary}
- Tendencias: ${trendsSummary}
- Posición de mercado: ${intelSummary}
- Brechas críticas: ${gaps.map(g => g.gap).join(' | ') || 'En evaluación'}
- Intelligence Core: Análisis estratégico profundo ejecutándose en paralelo
- Errores: ${errors.length > 0 ? errors.join(', ') : 'Ninguno'}

Genera un brief en exactamente este formato JSON:
{
  "headline": "Una frase poderosa de 8-12 palabras que capture el estado de EOS hoy",
  "status": "optimal|active|alert",
  "insights": ["insight estratégico 1", "insight estratégico 2", "insight estratégico 3"],
  "priority_action": "La acción más importante que KDK debe tomar hoy",
  "eos_signal": "Una observación profunda sobre el momento artístico de EOS"
}

Responde SOLO JSON válido.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 800, messages: [{ role: 'user', content: briefPrompt }] })
    });

    if (claudeRes.ok) {
      const claudeData = await claudeRes.json();
      const raw = claudeData.content[0].text.trim().replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim();
      brief = JSON.parse(raw);
      results.brief = brief;
    }
  } catch(e) {
    errors.push('brief: ' + e.message);
  }

  // ── FASE 7: Enviar brief por Telegram ──────────────────────────────────
  if (TG_TOKEN && TG_CHAT && brief) {
    try {
      const statusEmoji = { optimal: '🟢`, active: '🔵', alert: '🔴' }[brief.status] || '⚡';
      let tgMsg = `${statusEmoji} *EOS INTELLIGENCE BRIEF*\n_${new Date().toLocaleDateString('es-ES', { weekday:'leng', day:'numeric', month:'long' })}_\n\n`;
      tgMsg += `*"${brief.headline}"*\n\n`;
      tgMsg += `📊&�statusEmoji *SISTEMA HOY:*\n`;
      tgMsg += `• Scout: ${scoutSummary || 'Completado'}\n`;
      tgMsg += `• Intelligence Core: análisis estratégico en ejecución ⚡\n`;
      if (notifyData?.notified > 0) tgMsg += `• ${notifyData.notified} opp(s) notificadas\n`;
      tgMsg += `\n💡 *INSIGHTS:*\n`;
      (brief.insights || []).forEach(i => { tgMsg += `• ${i}\n`; });
      tgMsg += `\n⚡ *ACCIÓN CHOY:* ${brief.priority_action}\n`;
      tgMsg += `\n🎭 *SEÑAL EOS:* ${brief.eos_signal}\n`;
      tgMsg += `\n_EOS Νέα Αρχή — Sistema Operativo Artístico v2.0_`;

      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT, text: tgMsg, parse_mode: 'Markdown', disable_web_page_preview: true })
      });
    } catch(e) {
      errors.push('telegram_brief: ' + e.message);
    }
  }

  // ── Response final ──────────────────────────────────────────────────────
  results.completed_at = new Date().toISOString();
  results.errors = errors;
  results.phases_completed = Object.keys(results.agents).length;

  return res.status(200).json({ success: true, ...results });
}
