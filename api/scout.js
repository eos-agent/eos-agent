// ═══════════════════════════════════════════════════════
//  EOS AGENT — /api/scout  v2.3
//  Scout Agent: busca oportunidades reales en internet.
//  Acepta API keys del cliente (localStorage) para operar
//  sin necesitar env vars en Vercel.
// ═══════════════════════════════════════════════════════

const { searchWeb, formatSearch, callClaude, sendTelegram, handleCors } = require('./_utils');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = req.body || {};
  const claudeKey = body.claude_key || process.env.CLAUDE_API_KEY;
  const tavilyKey = body.tavily_key || process.env.TAVILY_API_KEY;
  const category  = body.category || 'all';

  if (!claudeKey) {
    return res.status(400).json({ error: 'claude_key required — configure it in EOS Settings' });
  }

  try {
    const allQueries = [
      { q: 'festivales showcases música independiente Colombia LATAM convocatoria open call 2026', label: 'FESTIVAL/SHOWCASE', type: 'festival' },
      { q: 'sync licensing playlists spotify curadores música indie español LATAM submissions 2026', label: 'SYNC/PLAYLIST', type: 'sync' },
      { q: 'becas residencias grants música emergente alternativa Colombia LATAM 2026', label: 'BECA/RESIDENCIA', type: 'beca' },
      { q: 'concursos premios música independiente cinematic documental LATAM 2026', label: 'CONCURSO/PREMIO', type: 'concurso' }
    ];

    const queries = category === 'all' ? allQueries : allQueries.filter(q => q.type === category);

    let webCtx = '';
    const rawResults = [];

    if (tavilyKey) {
      const results = await Promise.allSettled(
        queries.map(q => searchWeb(q.q, { maxResults: 3, includeAnswer: true }, tavilyKey))
      );
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          webCtx += '\n[' + queries[i].label + ']\n';
          webCtx += formatSearch(r.value, queries[i].q);
          (r.value.results || []).slice(0, 3).forEach(item => {
            rawResults.push({ type: queries[i].type, title: item.title, url: item.url, snippet: (item.content || '').slice(0, 200) });
          });
        }
      });
    }

    const webPart = webCtx ? 'DATOS WEB:\n' + webCtx : 'Sin datos Tavily — usa conocimiento LATAM 2026.';
    const prompt = 'Eres Scout Agent de EOS (Νέα Αρχή), proyecto musical cinematic/documental de Bogotá.\n\n' + webPart + '\n\nResponde SOLO con JSON válido, sin markdown, sin texto adicional:\n{"critical":{"title":"","why":"","deadline":"","action":""},"opportunities":[{"title":"","type":"festival|sync|beca|concurso","deadline":"","why":"","action":"","priority":"high|medium|low"}],"strategy":"","radar":""}\n\nMáximo 3 oportunidades. Sé conciso y específico para EOS.';

    const raw = await callClaude(prompt, '', 2000, claudeKey);

    // Robust JSON extraction
    let analysis = null;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        analysis = JSON.parse(raw.slice(start, end + 1));
      }
    } catch(e) {
      analysis = { strategy: raw, opportunities: [], radar: '' };
    }

    if (analysis && analysis.critical && process.env.TELEGRAM_TOKEN) {
      const msg = '\ud83d\udd34 *EOS SCOUT*\n\n*' + analysis.critical.title + '*\n' + analysis.critical.why + '\n\n\u23f0 ' + analysis.critical.deadline + '\n\u25b6\ufe0f ' + analysis.critical.action;
      await sendTelegram(msg).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      analysis,
      rawResults,
      queriesRan: queries.length,
      tavilyUsed: !!tavilyKey,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[EOS Scout Error]', err);
    return res.status(500).json({ error: err.message });
  }
};
