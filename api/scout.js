// ═══════════════════════════════════════════════════════
//  EOS AGENT — /api/scout
//  Scout Agent autónomo. n8n lo llama cada semana.
//  Busca oportunidades reales en internet y alerta.
// ═══════════════════════════════════════════════════════

const { searchWeb, formatSearch, callClaude, sendTelegram, handleCors, checkAuth } = require('./_utils');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // ── Búsquedas paralelas de oportunidades ─────────────
    const queries = [
      { q: 'festivales música independiente Colombia convocatoria open call 2025 2026', label: 'FESTIVAL' },
      { q: 'showcases emerging artists music LATAM Bogotá Medellín 2025', label: 'SHOWCASE' },
      { q: 'sync licensing música indie documental película 2025 convocatoria', label: 'SYNC' },
      { q: 'residencias artísticas música alternativa Colombia LATAM 2025', label: 'RESIDENCIA' },
      { q: 'playlists curadores spotify indie español LATAM submissions 2025', label: 'PLAYLIST' },
      { q: 'becas grants música emergente Colombia ministerio cultura 2025', label: 'BECA' }
    ];

    const results = await Promise.allSettled(
      queries.map(q => searchWeb(q.q, { maxResults: 3, includeAnswer: true, topic: 'general' }))
    );

    // Construir contexto
    let webCtx = '';
    results.forEach((res, i) => {
      if (res.status === 'fulfilled' && res.value) {
        webCtx += `\n[${queries[i].label}]\n`;
        webCtx += formatSearch(res.value, queries[i].q);
      }
    });

    // ── Claude analiza y prioriza ─────────────────────────
    const prompt = `Eres el Scout Agent de EOS. Analiza estos datos web y genera un reporte de oportunidades REALES.

DATOS WEB EN TIEMPO REAL:
${webCtx || 'No hay datos disponibles — usa conocimiento del ecosistema LATAM.'}

Genera:

🔍 *EOS SCOUT REPORT*

*🔴 OPORTUNIDAD CRÍTICA* (actuar esta semana)
[La más urgente — nombre, qué es, por qué EOS encaja, fecha límite]

*◈ OPORTUNIDADES DETECTADAS*
[3-4 oportunidades concretas con:
• Nombre del evento/convocatoria
• Fecha límite aproximada
• Por qué es relevante para EOS
• Acción inmediata]

*◎ ESTRATEGIA RECOMENDADA*
[Cómo EOS debe posicionarse esta semana para aprovechar estas oportunidades]

*▲ RADAR PRÓXIMAS 4 SEMANAS*
[Qué monitorear en el siguiente mes]

Solo información verificable de los datos web. Sé específico.`;

    const report = await callClaude(prompt, '', 1000);

    // ── Enviar a Telegram ─────────────────────────────────
    const sent = await sendTelegram(report);

    return res.status(200).json({
      success: true,
      report,
      telegram: sent,
      opportunitiesSearched: queries.length,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[EOS Scout Error]', err);
    await sendTelegram(`⚠️ *EOS Scout* — Error\n\`${err.message}\``).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
};
