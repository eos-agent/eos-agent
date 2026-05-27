// ═══════════════════════════════════════════════════════
//  EOS AGENT — /api/trends
//  Trend Analyzer autónomo. n8n lo llama cada semana.
//  Monitorea cultura, detecta oportunidades, alerta.
// ═══════════════════════════════════════════════════════

const { searchWeb, formatSearch, callClaude, sendTelegram, handleCors, checkAuth } = require('./_utils');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // ── Búsquedas de tendencias ───────────────────────────
    const [cultural, visual, platform, competitive] = await Promise.allSettled([
      searchWeb('tendencias música alternativa cinematic indie LATAM 2025 viral TikTok', {
        maxResults: 4, includeAnswer: true, topic: 'news'
      }),
      searchWeb('estéticas visuales música documental cinematográfico tendencia 2025', {
        maxResults: 3, includeAnswer: true, topic: 'general'
      }),
      searchWeb('algoritmo spotify instagram tiktok música indie 2025 crecimiento', {
        maxResults: 3, includeAnswer: true, topic: 'general'
      }),
      searchWeb('artistas alternativos colombia latinoamerica emergentes exitosos 2025', {
        maxResults: 3, includeAnswer: true, topic: 'general'
      })
    ]);

    let webCtx = '';
    if (cultural.status === 'fulfilled' && cultural.value)
      webCtx += formatSearch(cultural.value, 'Tendencias culturales actuales');
    if (visual.status === 'fulfilled' && visual.value)
      webCtx += formatSearch(visual.value, 'Estéticas visuales en tendencia');
    if (platform.status === 'fulfilled' && platform.value)
      webCtx += formatSearch(platform.value, 'Plataformas y algoritmos');
    if (competitive.status === 'fulfilled' && competitive.value)
      webCtx += formatSearch(competitive.value, 'Competencia y referentes');

    // ── Claude analiza ────────────────────────────────────
    const prompt = `Eres el Trend Analyzer de EOS. Analiza los datos culturales actuales.

DATOS WEB EN TIEMPO REAL:
${webCtx || 'Usa tu conocimiento profundo del ecosistema alternativo LATAM.'}

Genera el análisis:

◑ *EOS TREND REPORT*

*🔴 TENDENCIA CRÍTICA PARA EOS*
[La tendencia más relevante ahora mismo — por qué favorece a EOS específicamente]

*◈ MAPA DE TENDENCIAS*
• Tendencia que FAVORECE a EOS: [explica]
• Tendencia SATURADA — evitar: [explica]
• Tendencia EMERGENTE — aprovechar ya: [explica]

*◎ GAPS DE MERCADO DETECTADOS*
[2 espacios vacíos donde EOS puede posicionarse ahora mismo]

*⊕ POSICIONAMIENTO DIFERENCIAL*
[Cómo EOS se diferencia del ruido visual y sonoro actual en LATAM]

*▲ SEÑALES A MONITOREAR*
[3 señales culturales para seguir las próximas 2 semanas]

Cinematográfico, estratégico, nunca genérico.`;

    const report = await callClaude(prompt, '', 900);

    // ── Telegram ──────────────────────────────────────────
    const sent = await sendTelegram(report);

    return res.status(200).json({
      success: true,
      report,
      telegram: sent,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[EOS Trends Error]', err);
    await sendTelegram(`⚠️ *EOS Trends* — Error\n\`${err.message}\``).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
};
