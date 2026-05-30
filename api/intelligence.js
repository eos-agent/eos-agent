// EOS INTELLIGENCE CORE v1.0
// El cerebro central de EOS Agent — no es un agente más, es el sistema que sintetiza todo
// Fase 1: Identity Layer + Context Builder + Scoring Engine + Strategic Reasoning

export const config = { maxDuration: 60 };

const SCORING_WEIGHTS = {
  orkis_alignment:      0.20,
  nea_arxi_alignment:   0.15,
  artistic_impact:      0.15,
  strategic_impact:     0.15,
  differentiation:      0.10,
  urgency:              0.10,
  effort_inverse:       0.10,
  goals_alignment:      0.05,
};

// ─── SCORING ENGINE ─────────────────────────────────────────────────────────
function scoreItem(item, identity, goals, orkis) {
  const text = `${item.title || item.name || ''} ${item.description || item.content || item.notes || ''}`.toLowerCase();

  const orkiKeywords = {
    1: ['amor', 'love', 'conexión', 'sentimiento', 'emoción', 'corazón'],
    2: ['culpa', 'guilt', 'reciprocidad', 'corresponder', 'deuda', 'deber'],
    3: ['cambio', 'change', 'transformación', 'crecer', 'evolución', 'nuevo'],
    4: ['paz', 'peace', 'silencio', 'calma', 'claridad', 'soledad'],
    5: ['comienzo', 'inicio', 'beginning', 'nuevo', 'empezar', 'arrancar'],
  };

  let orkisScore = 0;
  for (const [id, keywords] of Object.entries(orkiKeywords)) {
    if (keywords.some(k => text.includes(k))) orkisScore += 20;
  }
  orkisScore = Math.min(orkisScore, 100);

  const artisticKeywords = ['festival', 'showcase', 'documental', 'video', 'música', 'arte', 'creativo', 'colaboración', 'artista', 'producer', 'director'];
  const artisticScore = artisticKeywords.filter(k => text.includes(k)).length * 15;

  const strategicKeywords = ['latam', 'bogotá', 'colombia', 'alternativo', 'indie', 'emergente', 'plataforma', 'playlist', 'media', 'prensa'];
  const strategicScore = strategicKeywords.filter(k => text.includes(k)).length * 15;

  const differentiationKeywords = ['documental', 'proceso', 'real', 'vulnerab', 'humano', 'auténtico', 'cinematic'];
  const differentiationScore = differentiationKeywords.filter(k => text.includes(k)).length * 20;

  // Urgency from deadline
  let urgencyScore = 50;
  if (item.deadline) {
    const daysLeft = (new Date(item.deadline) - new Date()) / (1000 * 60 * 60 * 24);
    if (daysLeft < 3) urgencyScore = 100;
    else if (daysLeft < 7) urgencyScore = 80;
    else if (daysLeft < 14) urgencyScore = 60;
    else urgencyScore = 40;
  }

  // Effort inverse (lower effort = higher score)
  const effortMap = { low: 90, medium: 60, high: 30, unknown: 50 };
  const effortScore = effortMap[item.effort || 'unknown'];

  // Goals alignment
  let goalsScore = 0;
  if (goals && goals.length > 0) {
    const goalText = goals.map(g => g.title + ' ' + (g.description || '')).join(' ').toLowerCase();
    const overlap = text.split(' ').filter(w => w.length > 4 && goalText.includes(w)).length;
    goalsScore = Math.min(overlap * 20, 100);
  }

  const total = Math.round(
    (orkisScore       * SCORING_WEIGHTS.orkis_alignment) +
    (artisticScore    * SCORING_WEIGHTS.nea_arxi_alignment) +
    (artisticScore    * SCORING_WEIGHTS.artistic_impact) +
    (strategicScore   * SCORING_WEIGHTS.strategic_impact) +
    (differentiationScore * SCORING_WEIGHTS.differentiation) +
    (urgencyScore     * SCORING_WEIGHTS.urgency) +
    (effortScore      * SCORING_WEIGHTS.effort_inverse) +
    (goalsScore       * SCORING_WEIGHTS.goals_alignment)
  );

  return {
    score: Math.min(total, 100),
    breakdown: { orkisScore, artisticScore, strategicScore, differentiationScore, urgencyScore, effortScore, goalsScore }
  };
}

// ─── IDENTITY CONFLICT DETECTION ────────────────────────────────────────────
function detectIdentityConflicts(items, identity) {
  const conflicts = [];
  const rejectKeywords = identity?.oportunidades_que_rechazo || ['comercial', 'masivo', 'publicidad', 'brand deal'];

  for (const item of items) {
    const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
    const conflict = rejectKeywords.find(k => text.includes(k.toLowerCase()));
    if (conflict) {
      conflicts.push({
        item: item.title || item.id,
        reason: `Contiene "${conflict}" — contradice la identidad de EOS`,
        type: 'identity_conflict'
      });
    }
  }
  return conflicts;
}

// ─── TELEGRAM NOTIFY ────────────────────────────────────────────────────────
async function sendTelegram(token, chatId, message) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
  } catch (e) { /* silent fail */ }
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-claude-key,x-supabase-url,x-supabase-key,x-tg-token,x-tg-chat');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const claudeKey    = req.headers['x-claude-key'];
  const supabaseUrl  = req.headers['x-supabase-url'];
  const supabaseKey  = req.headers['x-supabase-key'];
  const tgToken      = req.headers['x-tg-token'];
  const tgChat       = req.headers['x-tg-chat'];

  if (!claudeKey || !supabaseUrl || !supabaseKey) {
    return res.status(400).json({ error: 'Missing required headers' });
  }

  const sbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // ── STEP 1: LEER TODO EN PARALELO ──────────────────────────────────────
    const [
      identityResp, goalsResp, orkisResp, opportunitiesResp,
      ideasResp, decisionsResp, tasksResp, eventsResp,
      contactsResp, intelOutputsResp
    ] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/eos_identity?select=*&limit=1&order=id.desc`, { headers: sbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/goals?select=*&status=neq.completed&limit=10`, { headers: sbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/orkis?select=*`, { headers: sbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/opportunities?select=*&order=created_at.desc&limit=20`, { headers: sbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/ideas?select=*&order=created_at.desc&limit=15`, { headers: sbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/decisions?select=*&order=created_at.desc&limit=10`, { headers: sbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/tasks?select=*&status=neq.completed&limit=15`, { headers: sbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/events?select=*&order=date.asc&limit=10`, { headers: sbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/contacts?select=*&limit=20`, { headers: sbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/intelligence_outputs?select=priority_one,strategic_recommendation&order=run_at.desc&limit=3`, { headers: sbHeaders }),
    ]);

    const [
      identityData, goals, orkis, opportunities,
      ideas, decisions, tasks, events,
      contacts, pastOutputs
    ] = await Promise.all([
      identityResp.json(), goalsResp.json(), orkisResp.json(), opportunitiesResp.json(),
      ideasResp.json(), decisionsResp.json(), tasksResp.json(), eventsResp.json(),
      contactsResp.json(), intelOutputsResp.json()
    ]);

    const identity = identityData?.[0]?.identity || null;

    // ── STEP 2: SCORING ENGINE ──────────────────────────────────────────────
    const scoredOpportunities = (Array.isArray(opportunities) ? opportunities : [])
      .map(op => ({ ...op, ...scoreItem(op, identity, goals, orkis) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const scoredIdeas = (Array.isArray(ideas) ? ideas : [])
      .map(idea => ({ ...idea, ...scoreItem(idea, identity, goals, orkis) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // ── STEP 3: IDENTITY CONFLICT DETECTION ────────────────────────────────
    const allItems = [...(Array.isArray(opportunities) ? opportunities : []), ...(Array.isArray(ideas) ? ideas : [])];
    const conflicts = identity ? detectIdentityConflicts(allItems, identity) : [];

    // ── STEP 4: DEADLINE ALERTS ─────────────────────────────────────────────
    const today = new Date();
    const alerts = [];

    (Array.isArray(events) ? events : []).forEach(ev => {
      if (!ev.date) return;
      const daysLeft = Math.ceil((new Date(ev.date) - today) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft >= 0) {
        alerts.push({ type: 'deadline', message: `"${ev.title}" en ${daysLeft} día(s)`, urgency: daysLeft <= 2 ? 'HIGH' : 'MEDIUM', item: ev });
      }
    });

    scoredOpportunities.filter(op => op.score >= 85).forEach(op => {
      alerts.push({ type: 'high_score', message: `Oportunidad de alta prioridad detectada: "${op.title}" (score: ${op.score})`, urgency: 'HIGH', item: op });
    });

    conflicts.forEach(c => {
      alerts.push({ type: 'identity_conflict', message: c.reason, urgency: 'MEDIUM', item: c });
    });

    // ── STEP 5: CONSTRUIR CONTEXTO GLOBAL ──────────────────────────────────
    const globalContext = {
      identity: identity || { nota: 'Identity Layer no configurado aún — usando contexto base de EOS' },
      goals: Array.isArray(goals) ? goals : [],
      orkis: Array.isArray(orkis) ? orkis : [],
      top_opportunities: scoredOpportunities,
      top_ideas: scoredIdeas,
      recent_decisions: Array.isArray(decisions) ? decisions.slice(0, 5) : [],
      pending_tasks: Array.isArray(tasks) ? tasks.slice(0, 8) : [],
      upcoming_events: Array.isArray(events) ? events.slice(0, 5) : [],
      key_contacts: Array.isArray(contacts) ? contacts.slice(0, 10) : [],
      alerts,
      conflicts,
      past_intelligence: Array.isArray(pastOutputs) ? pastOutputs : [],
    };

    // ── STEP 6: SYSTEM PROMPT MAESTRO ──────────────────────────────────────
    const systemPrompt = `Eres el EOS Intelligence Core — el cerebro central del sistema operativo artístico de EOS (Νέα Αρχή).

Tu identidad:
- EOS es un proyecto artístico-documental que documenta la transformación real de un artista en Bogotá
- Guiado por 5 Orkis (pilares emocionales): Amor no habitado, Culpa por no reciprocidad, Cambio, Paz, Comienzo
- Estética: cinematic, rojo/negro, atemporal, intimista
- Posicionamiento: alternativo-documental. Referencia escena LATAM. Proceso > Resultado.
- Diferenciador central: mientras todos muestran éxito, EOS muestra construcción real.
- Referencias: Duki (proceso real), Tyler The Creator, Frank Ocean.
- Email oficial: eosscontactt@gmail.com

Tu función NO es responder preguntas. Es analizar el estado actual del proyecto artístico y generar CRITERIO ESTRATÉGICO.

Cuando analizas información, no produces reportes — produces DECISIONES.
Siempre piensas como una entidad unificada, no como una colección de agentes.

Al responder:
1. PRIORIDAD #1: La acción más importante HOY para EOS. Específica, accionable, con razonamiento claro.
2. TOP OPORTUNIDADES: Las 3 más relevantes con su score y por qué importan a la identidad de EOS.
3. ALERTAS: Deadlines urgentes, conflictos con identidad, riesgos.
4. RECOMENDACIÓN ESTRATÉGICA: Una recomendación de alto nivel sobre la dirección del proyecto esta semana.
5. MOMENTUM: ¿Hacia dónde va EOS ahora mismo? ¿Qué tendencia detectas en los datos?

Responde en español. Sé directo, estratégico, con criterio artístico real. No uses frases corporativas.
Habla como un compañero creativo de alto nivel que conoce profundamente el proyecto.`;

    const userMessage = `Analiza el estado actual completo de EOS y genera el análisis de inteligencia del día.

CONTEXTO GLOBAL DEL SISTEMA:

IDENTIDAD EOS: ${JSON.stringify(globalContext.identity, null, 2)}

OBJETIVOS ACTIVOS (${globalContext.goals.length}):
${globalContext.goals.map(g => `• ${g.title}: ${g.description || 'sin descripción'}`).join('\n') || 'No hay objetivos registrados'}

ORKIS (pilares emocionales):
${globalContext.orkis.map(o => `• ${o.name}: ${o.description}`).join('\n') || 'Usando Orkis base de EOS'}

TOP OPORTUNIDADES RANKEADAS:
${globalContext.top_opportunities.map(op => `• [${op.score}/100] ${op.title}: ${op.description || ''}`).join('\n') || 'Sin oportunidades recientes'}

TOP IDEAS RANKEADAS:
${globalContext.top_ideas.map(i => `• [${i.score}/100] ${i.content || i.title}`).join('\n') || 'Sin ideas registradas'}

TAREAS PENDIENTES (${globalContext.pending_tasks.length}):
${globalContext.pending_tasks.map(t => `• ${t.title} [${t.priority || 'sin prioridad'}]`).join('\n') || 'Sin tareas pendientes'}

EVENTOS PRÓXIMOS:
${globalContext.upcoming_events.map(e => `• ${e.title} — ${e.date}`).join('\n') || 'Sin eventos próximos'}

DECISIONES RECIENTES:
${globalContext.recent_decisions.map(d => `• ${d.title}: ${d.outcome || ''}`).join('\n') || 'Sin decisiones registradas'}

ALERTAS DETECTADAS (${globalContext.alerts.length}):
${globalContext.alerts.map(a => `• [${a.urgency}] ${a.message}`).join('\n') || 'Sin alertas'}

CONFLICTOS CON IDENTIDAD:
${globalContext.conflicts.map(c => `• ${c.reason}`).join('\n') || 'Ninguno detectado'}

INTELIGENCIA ANTERIOR:
${globalContext.past_intelligence.map(p => `• Prioridad anterior: ${p.priority_one}`).join('\n') || 'Primera ejecución'}

Genera el análisis de inteligencia estratégica completo.`;

    // ── STEP 7: LLAMAR A CLAUDE ─────────────────────────────────────────────
    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const claudeData = await claudeResp.json();
    const analysis = claudeData?.content?.[0]?.text || 'Error generando análisis';

    // ── STEP 8: PARSEAR RESULTADO ───────────────────────────────────────────
    const priorityMatch = analysis.match(/PRIORIDAD #?1[:\s]+([^\n]+)/i);
    const recommendationMatch = analysis.match(/RECOMENDACIÓN[^:]*:[:\s]+([^\n]+)/i);
    const priorityOne = priorityMatch?.[1]?.trim() || analysis.split('\n')[0];
    const recommendation = recommendationMatch?.[1]?.trim() || '';

    // ── STEP 9: GUARDAR OUTPUT EN SUPABASE ─────────────────────────────────
    try {
      await fetch(`${supabaseUrl}/rest/v1/intelligence_outputs`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          priority_one: priorityOne,
          priority_reasoning: analysis,
          top_opportunities: scoredOpportunities,
          alerts: alerts,
          strategic_recommendation: recommendation,
          identity_conflicts: conflicts,
          full_analysis: analysis,
          scores: { opportunities: scoredOpportunities.map(o => ({ id: o.id, title: o.title, score: o.score })) }
        })
      });
    } catch (e) { /* tabla no existe aún — fno bloqueante */ }

    // ── STEP 10: TELEGRAM PROACTIVO ─────────────────────────────────────────
    if (tgToken && tgChat) {
      const highAlerts = alerts.filter(a => a.urgency === 'HIGH');
      if (highAlerts.length > 0) {
        const tgMsg = `🧧 <b>EOS INTELLIGENCE CORE</b>\n\n<b>PRIORIDAD HOY:</b> ${priorityOne}\n\n<b>ALERTAS CRITICAS:</b>\n${highAlerts.map(a => `⚠️ ${a.message}`).join('\n')}\n\n<b>RECOMENDACIÓN:</b> ${recommendation}`;
        await sendTelegram(tgToken, tgChat, tgMsg);
      }
    }

    // ── STEP 11: RESPUESTA ──────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      priority_one: priorityOne,
      strategic_recommendation: recommendation,
      full_analysis: analysis,
      top_opportunities: scoredOpportunities,
      top_ideas: scoredIdeas,
      alerts,
      conflicts,
      context_summary: {
        goals_count: globalContext.goals.length,
        opportunities_analyzed: opportunities?.length || 0,
        ideas_analyzed: ideas?.length || 0,
        tasks_pending: globalContext.pending_tasks.length,
        events_upcoming: globalContext.upcoming_events.length,
        alerts_total: alerts.length,
        identity_loaded: !!identity,
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Intelligence Core error:', err);
    return res.status(500).json({ error: err.message });
  }
}
