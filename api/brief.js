// ═══════════════════════════════════════════════════════
//  EOS AGENT — /api/brief
//  Reporte matutino autónomo. n8n lo llama cada mañana.
//  Busca en internet + Claude genera briefing + Telegram.
// ═══════════════════════════════════════════════════════

const { searchWeb, formatSearch, callClaude, sendTelegram, handleCors, checkAuth } = require('./_utils');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Bogota'
  });

  try {
    // ── PASO 1: Búsquedas web paralelas ──────────────────
    const [opportunities, trends, culture] = await Promise.allSettled([
      searchWeb('festivales música indie alternativa LATAM Colombia convocatoria 2025 2026', {
        maxResults: 4, includeAnswer: true, topic: 'general'
      }),
      searchWeb('tendencias música cinematic documental TikTok Instagram viral 2025', {
        maxResults: 4, includeAnswer: true, topic: 'news'
      }),
      searchWeb('artistas alternativos emergentes Colombia Bogotá 2025 nuevos lanzamientos', {
        maxResults: 3, includeAnswer: true, topic: 'general'
      })
    ]);

    // Formatear resultados
    let webCtx = '';
    if (opportunities.status === 'fulfilled' && opportunities.value)
      webCtx += formatSearch(opportunities.value, 'Oportunidades LATAM');
    if (trends.status === 'fulfilled' && trends.value)
      webCtx += formatSearch(trends.value, 'Tendencias culturales');
    if (culture.status === 'fulfilled' && culture.value)
      webCtx += formatSearch(culture.value, 'Escena alternativa Colombia');

    // ── PASO 2: Claude genera el briefing ────────────────
    const prompt = `Genera el REPORTE MATUTINO de EOS Agent para HOY: ${today}

Datos web en tiempo real:
${webCtx || 'No hay datos web disponibles — usa tu conocimiento estratégico.'}

Estructura el reporte así:

🔴 *EOS MORNING BRIEF* — ${today}

*◈ OPORTUNIDAD DEL DÍA*
[La oportunidad más relevante detectada hoy — específica y accionable]

*◑ TENDENCIA A MONITOREAR*
[1 tendencia cultural actual que afecta a EOS directamente]

*◎ ACCIÓN PRIORITARIA*
[1 sola cosa que KDK debe hacer hoy para mover EOS hacia adelante]

*⊕ INSIGHT ESTRATÉGICO*
[Observación profunda sobre el ecosistema — algo que los demás no ven]

*▲ RADAR DE OPORTUNIDADES*
[2-3 oportunidades detectadas esta semana — con fecha límite si aplica]

Sé cinematográfico, específico y directo. Sin relleno.`;

    const brief = await callClaude(prompt, '', 900);

    // ── PASO 3: Enviar a Telegram ─────────────────────────
    const sent = await sendTelegram(brief);

    // ── PASO 4: Respuesta ────────────────────────────────
    return res.status(200).json({
      success: true,
      date: today,
      brief,
      telegram: sent,
      webSearches: webCtx ? 3 : 0,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[EOS Brief Error]', err);

    // Enviar error a Telegram si hay config
    await sendTelegram(`⚠️ *EOS Agent* — Error en Morning Brief\n\`${err.message}\``).catch(() => {});

    return res.status(500).json({ error: err.message });
  }
};
