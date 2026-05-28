// EOS AGENT — /api/scout v2.0
const { searchWeb, formatSearch, callClaude, sendTelegram, handleCors } = require('./_utils');
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  const body = req.body || {};
  const claudeKey = body.claude_key || process.env.CLAUDE_API_KEY;
  const tavilyKey = body.tavily_key || process.env.TAVILY_API_KEY;
  const category = body.category || 'all';
  if (!claudeKey) return res.status(400).json({ error: 'claude_key required' });
  try {
    const allQueries = [
      { q: 'festivales showcases música independiente Colombia LATAM convocatoria open call 2026', label: 'FESTIVAL', type: 'festival' },
      { q: 'sync licensing playlists spotify curadores música indie español LATAM submissions 2026', label: 'SYNC', type: 'sync' },
      { q: 'becas residencias grants música emergente alternativa Colombia LATAM 2026', label: 'BECA', type: 'beca' },
      { q: 'concursos premios música independiente cinematic documental LATAM 2026', label: 'CONCURSO', type: 'concurso' }
    ];
    const queries = category === 'all' ? allQueries : allQueries.filter(q => q.type === category);
    let webCtx = '';
    const rawResults = [];
    if (tavilyKey) {
      const results = await Promise.allSettled(queries.map(q => searchWeb(q.q, { maxResults: 3, includeAnswer: true }, tavilyKey)));
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          webCtx += '[' + queries[i].label + ']\n' + formatSearch(r.value, queries[i].q);
          (r.value.results || []).slice(0,3).forEach(item => rawResults.push({ type: queries[i].type, title: item.title, url: item.url, snippet: (item.content||'').slice(0,200) }));
        }
      });
    }
    const prompt = 'Eres el Scout Agent de EOS (Nea Archi), proyecto musical cinematic de Bogota, Colombia.\n\n' + (webCtx ? 'DATOS WEB:\n' + webCtx : 'Usa conocimiento del ecosistema LATAM 2026.') + '\n\nGenera JSON de oportunidades:{\n"critical":{"title":"...","why":"...","deadline":"...","action":"..."},\n"opportunities":[{"title":"...","type":"festival|sync|beca|concurso","deadline":"...","why":"...","action":"...","priority":"high|medium|low"}],\n"strategy":"...","radar":"..."}\nSolo JSON, sin markdown.';
    const raw = await callClaude(prompt, '', 900, claudeKey);
    let analysis = null;
    try { const m = raw.match(/\{[\s\S]*\}/); if (m) analysis = JSON.parse(m[0]); } catch(e) { analysis = { strategy: raw, opportunities: [], radar: '' }; }
    if (analysis?.critical && process.env.TELEGRAM_TOKEN) {
      const msg = '🔴 *EOS SCOUT*\n*' + analysis.critical.title + '*\n' + analysis.critical.why + '\n⏰ ' + analysis.critical.deadline + '\n▶️ ' + analysis.critical.action;
      await sendTelegram(msg).catch(() => {});
    }
    return res.status(200).json({ success: true, analysis, rawResults, queriesRan: queries.length, tavilyUsed: !!tavilyKey, timestamp: new Date().toISOString() });
  } catch(err) {
    console.error('[Scout]', err);
    return res.status(500).json({ error: err.message });
  }
};