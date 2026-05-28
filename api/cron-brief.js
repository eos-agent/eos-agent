// ═══════════════════════════════════════════════════════
//  EOS AGENT — /api/cron-brief
//  Vercel Cron Job: Morning Brief diario 8am Bogotá (1pm UTC).
// ═══════════════════════════════════════════════════════

const { searchWeb, formatSearch, callClaude, sendTelegram } = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const claudeKey = process.env.CLAUDE_API_KEY;
  if (!claudeKey) return res.status(500).json({ error: 'CLAUDE_API_KEY not set in Vercel env vars' });

  const today = new Date().toLocaleDateString('es-CO', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'America/Bogota' });

  try {
    const [opportunities, trends, culture] = await Promise.allSettled([
      searchWeb('festivales música indie alternativa LATAM Colombia convocatoria 2026', { maxResults: 3, includeAnswer: true }),
      searchWeb('tendencias música cinematic documental TikTok Instagram viral 2026', { maxResults: 3, includeAnswer: true, topic: 'news' }),
      searchWeb('artistas alternativos emergentes Colombia Bogotá nuevos lanzamientos 2026', { maxResults: 3, includeAnswer: true })
    ]);

    let webCtx = '';
    if (opportunities.status==='fulfilled' && opportunities.value) webCtx += formatSearch(opportunities.value, 'Oportunidades LATAM');
    if (trends.status==='fulfilled' && trends.value) webCtx += formatSearch(trends.value, 'Tendencias culturales');
    if (culture.status==='fulfilled' && culture.value) webCtx += formatSearch(culture.value, 'Escena Colombia');

    const prompt = 'Genera REPORTE MATUTINO EOS para HOY: ' + today + '\n\nDatos web:\n' + (webCtx||'Sin datos.') + '\n\nEstructura:\n🔴 *EOS MORNING BRIEF* — ' + today + '\n\n*◈ OPORTUNIDAD DEL DÍA*\n[La más relevante]\n\n*◑ TENDENCIA*\n[1 que afecta a EOS]\n\n*◎ ACCIÓN PRIORITARIA*\n[1 sola cosa hoy]\n\n*⊕ INSIGHT*\n[Lo que los demás no ven]\n\n*▲ RADAR*\n[2-3 oportunidades con fechas]\n\nCinematográfico y directo.';

    const brief = await callClaude(prompt, '', 1200, claudeKey);
    await sendTelegram(brief);

    return res.status(200).json({ success: true, date: today, timestamp: new Date().toISOString() });
  } catch (err) {
    await sendTelegram('⚠️ *EOS Brief Cron* — Error\n`' + err.message + '`').catch(()=>{});
    return res.status(500).json({ error: err.message });
  }
};