// ═══════════════════════════════════════════════════════
//  EOS AGENT — /api/cron-scout
//  Vercel Cron Job: corre automáticamente lunes y jueves.
//  Usa CLAUDE_API_KEY y TAVILY_API_KEY de Vercel env vars.
// ═══════════════════════════════════════════════════════

const { searchWeb, formatSearch, callClaude, sendTelegram } = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const claudeKey = process.env.CLAUDE_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!claudeKey) return res.status(500).json({ error: 'CLAUDE_API_KEY not set in Vercel env vars' });

  try {
    const allQueries = [
      { q: 'festivales showcases música independiente Colombia LATAM convocatoria open call 2026', label: 'FESTIVAL/SHOWCASE', type: 'festival' },
      { q: 'sync licensing playlists spotify curadores música indie español LATAM submissions 2026', label: 'SYNC/PLAYLIST', type: 'sync' },
      { q: 'becas residencias grants música emergente alternativa Colombia LATAM 2026', label: 'BECA/RESIDENCIA', type: 'beca' },
      { q: 'concursos premios música independiente cinematic documental LATAM 2026', label: 'CONCURSO/PREMIO', type: 'concurso' }
    ];

    let webCtx = '';
    const rawResults = [];

    if (tavilyKey) {
      const results = await Promise.allSettled(
        allQueries.map(q => searchWeb(q.q, { maxResults: 3, includeAnswer: true }, tavilyKey))
      );
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          webCtx += '\n[' + allQueries[i].label + ']\n';
          webCtx += formatSearch(r.value, allQueries[i].q);
        }
      });
    }

    const webPart = webCtx ? 'DATOS WEB:\n' + webCtx : 'Sin datos Tavily — usa conocimiento LATAM 2026.';
    const prompt = 'Eres Scout Agent de EOS (Νέα Αρχή), proyecto musical cinematic/documental de Bogotá.\n\n' + webPart + '\n\nResponde SOLO con JSON válido, sin markdown:\n{"critical":{"title":"","why":"","deadline":"","action":""},"opportunities":[{"title":"","type":"festival|sync|beca|concurso","deadline":"","why":"","action":"","priority":"high|medium|low"}],"strategy":"","radar":""}\n\nMáximo 3 oportunidades. Conciso y específico para EOS.';

    const raw = await callClaude(prompt, '', 2000, claudeKey);
    let analysis = null;
    try {
      const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) analysis = JSON.parse(raw.slice(start, end + 1));
    } catch(e) { analysis = { strategy: raw, opportunities: [], radar: '' }; }

    const opps = (analysis?.opportunities || []).map((o, i) =>
      '\n' + (i+1) + '. *' + o.title + '* [' + (o.priority||'').toUpperCase() + ']\n   ⏰ ' + o.deadline + '\n   ' + o.why
    ).join('');

    const msg = '🔴 *EOS SCOUT — REPORTE AUTOMÁTICO*\n\n*◈ CRÍTICO: ' + (analysis?.critical?.title||'N/A') + '*\n' + (analysis?.critical?.why||'') + '\n⏰ ' + (analysis?.critical?.deadline||'') + '\n▶️ ' + (analysis?.critical?.action||'') + '\n\n*▲ OPORTUNIDADES*' + opps + '\n\n*⊕ ESTRATEGIA*\n' + (analysis?.strategy||'') + '\n\n_Auto — ' + new Date().toLocaleString('es-CO', {timeZone:'America/Bogota'}) + '_';

    await sendTelegram(msg);

    return res.status(200).json({ success: true, analysis, tavilyUsed: !!tavilyKey, timestamp: new Date().toISOString() });
  } catch (err) {
    await sendTelegram('⚠️ *EOS Scout Cron* — Error\n`' + err.message + '`').catch(()=>{});
    return res.status(500).json({ error: err.message });
  }
};