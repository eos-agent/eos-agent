// EOS Agent — Orchestrator v2.0
// Coordina Scout -> Trends -> Competitive Intel -> Intelligence Core -> Notify -> Brief
// El cerebro que conecta todos los agentes de EOS

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-claude-key, x-tavily-key, x-supabase-url, x-supabase-key, x-telegram-token, x-telegram-chat-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const CLAUDE   = req.headers['x-claude-key'];
  const TAVILY   = req.headers['x-tavily-key'];
  const SB_URL   = req.headers['x-supabase-url'];
  const SB_KEY   = req.headers['x-supabase-key'];
  const TG_TOKEN = req.headers['x-telegram-token'];
  const TG_CHAT  = req.headers['x-telegram-chat-id'];

  if (!CLAUDE || !TAVILY) {
    return res.status(400).json({ error: 'Missing Claude or Tavily keys' });
  }

  const BASE = 'https://eos-agent.vercel.app';

  let activeGoals = [];
  if (SB_URL && SB_KEY) {
    try {
      const gr = await fetch(SB_URL + '/rest/v1/goals?status=eq.active&order=priority.desc&limit=10', {
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
      });
      if (gr.ok) activeGoals = await gr.json();
    } catch(e) {}
  }

  const results = { started_at: new Date().toISOString(), agents: {} };
  const errors = [];

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

  // FASE 1: Scout
  const scoutData = await runAgent('scout', '/api/scout');
  await new Promise(r => setTimeout(r, 1500));

  // FASE 2: Trends
  const trendsData = await runAgent('trends', '/api/trends');
  await new Promise(r => setTimeout(r, 1500));

  // FASE 3: Competitive Intelligence
  const intelData = await runAgent('competitive', '/api/competitive');
  await new Promise(r => setTimeout(r, 1500));

  // FASE 4: Intelligence Core (fire-and-forget — runs async ~60s)
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
      }).catch(() => {});
      results.agents['intelligence'] = { success: true, status: 'triggered_async', note: 'Running in background — saves to Supabase + Telegram' };
    } catch(e) {
      results.agents['intelligence'] = { success: false, error: e.message };
    }
  }
  await new Promise(r => setTimeout(r, 500));

  // FASE 5: Notify
  let notifyData = null;
  if (TG_TOKEN && TG_CHAT && SB_URL && SB_KEY) {
    notifyData = await runAgent('notify', '/api/notify');
    await new Promise(r => setTimeout(r, 800));
  }

  // FASE 6: Brief con Claude
  let brief = null;
  try {
    const scoutSummary = scoutData && scoutData.opps > 0
      ? scoutData.opps + ' oportunidades detectadas'
      : 'Sin nuevas oportunidades esta sesion';
    const trendsSummary = trendsData && trendsData.trends
      ? trendsData.trends.slice(0,3).map(t => t.title || t).join(', ')
      : 'Analisis completado';
    const intelSummary = intelData && intelData.analysis && intelData.analysis.eos_differentiation
      ? intelData.analysis.eos_differentiation.unique_position
      : 'Analisis completado';
    const gaps = intelData && intelData.analysis && intelData.analysis.market_gaps
      ? intelData.analysis.market_gaps.filter(g => g.priority === 'critical' || g.priority === 'high').slice(0,2)
      : [];
    const goalsText = activeGoals.length > 0
      ? activeGoals.map(g => '- [' + g.priority.toUpperCase() + '] ' + g.title).join('
')
      : 'Sin objetivos registrados';

    const briefPrompt = 'Eres EOS Agent, sistema de inteligencia artistica de EOS (Nea Arxi).
' +
      'Genera un brief diario conciso, estrategico y cinematografico.

' +
      'OBJETIVOS ACTIVOS:
' + goalsText + '

' +
      'DATOS HOY:
' +
      '- Scout: ' + scoutSummary + '
' +
      '- Tendencias: ' + trendsSummary + '
' +
      '- Mercado: ' + intelSummary + '
' +
      '- Brechas: ' + (gaps.map(g => g.gap).join(' | ') || 'En evaluacion') + '
' +
      '- Intelligence Core: analisis profundo ejecutandose en paralelo
' +
      '- Errores: ' + (errors.length > 0 ? errors.join(', ') : 'Ninguno') + '

' +
      'Responde SOLO este JSON valido:
' +
      '{"headline":"frase 8-12 palabras estado EOS hoy","status":"optimal|active|alert",' +
      '"insights":["insight 1","insight 2","insight 3"],' +
      '"priority_action":"accion mas importante hoy",' +
      '"eos_signal":"observacion profunda sobre el momento artistico de EOS"}';

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 600, messages: [{ role: 'user', content: briefPrompt }] })
    });
    if (claudeRes.ok) {
      const cd = await claudeRes.json();
      const raw = cd.content[0].text.trim().replace(/^```jsons*/i,'').replace(/^```/,'').replace(/```$/,'').trim();
      brief = JSON.parse(raw);
      results.brief = brief;
    }
  } catch(e) {
    errors.push('brief: ' + e.message);
  }

  // FASE 7: Telegram brief
  if (TG_TOKEN && TG_CHAT && brief) {
    try {
      const emoji = { optimal: String.fromCodePoint(0x1F7E2), active: String.fromCodePoint(0x1F535), alert: String.fromCodePoint(0x1F534) }[brief.status] || String.fromCodePoint(0x26A1);
      const scoutSummary = scoutData && scoutData.opps > 0 ? scoutData.opps + ' oportunidades' : 'Completado';
      let msg = emoji + ' *EOS INTELLIGENCE BRIEF*
_' + new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' }) + '_

';
      msg += '*"' + brief.headline + '"*

';
      msg += String.fromCodePoint(0x1F4CA) + ' *SISTEMA HOY:*
';
      msg += String.fromCodePoint(0x2022) + ' Scout: ' + scoutSummary + '
';
      msg += String.fromCodePoint(0x2022) + ' Intelligence Core: ejecutandose ' + String.fromCodePoint(0x26A1) + '
';
      if (notifyData && notifyData.notified > 0) msg += String.fromCodePoint(0x2022) + ' ' + notifyData.notified + ' opp(s) notificadas
';
      msg += '
' + String.fromCodePoint(0x1F4A1) + ' *INSIGHTS:*
';
      (brief.insights || []).forEach(i => { msg += String.fromCodePoint(0x2022) + ' ' + i + '
'; });
      msg += '
' + String.fromCodePoint(0x26A1) + ' *ACCION HOY:* ' + brief.priority_action + '
';
      msg += '
' + String.fromCodePoint(0x1F3AD) + ' *SENAL EOS:* ' + brief.eos_signal + '
';
      msg += '
_EOS Nea Arxi — Sistema Operativo Artistico v2.0_';
      await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'Markdown', disable_web_page_preview: true })
      });
    } catch(e) { errors.push('telegram: ' + e.message); }
  }

  results.completed_at = new Date().toISOString();
  results.errors = errors;
  results.phases_completed = Object.keys(results.agents).length;
  return res.status(200).json({ success: true, ...results });
}
