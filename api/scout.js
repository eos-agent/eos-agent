// api/scout.js — EOS Scout Agent v2.5
// Self-contained: sin imports externos. Busca oportunidades + guarda en Supabase.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-claude-key,x-tavily-key,x-supabase-url,x-supabase-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.body || {};
  const claudeKey  = req.headers['x-claude-key']   || body.claudeKey;
  const tavilyKey  = req.headers['x-tavily-key']   || body.tavilyKey;
  const tgToken    = body.telegramToken;
  const tgChat     = body.telegramChatId;
  const supaUrl    = req.headers['x-supabase-url'] || body.supabaseUrl || process.env.SUPABASE_URL;
  const supaKey    = req.headers['x-supabase-key'] || body.supabaseKey || process.env.SUPABASE_SERVICE_KEY;

  if (!claudeKey) return res.status(400).json({ error: 'Missing claudeKey' });

  try {
    // 1. Busqueda Tavily
    let webResults = '';
    let tavilyUsed = false;
    if (tavilyKey) {
      const queries = [
        'music festival open call Colombia LATAM 2025 2026',
        'alternative cinematic music showcase emerging artists',
        'Spotify playlist curator indie submission open',
        'music blog submission independent artists Bogota'
      ];
      const searches = await Promise.allSettled(
        queries.slice(0,3).map(q => fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ api_key: tavilyKey, query: q, max_results: 3, search_depth: 'basic' })
        }).then(r=>r.json()).then(d=>d.results?.map(r=>r.title+': '+r.url).join(' | ')).catch(()=>''))
      );
      const good = searches.filter(r=>r.status==='fulfilled' && r.value).map(r=>r.value);
      if (good.length > 0) { webResults = good.join('\n'); tavilyUsed = true; }
    }

    // 2. Claude analiza oportunidades
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: 'Eres el Scout Agent de EOS — radar de oportunidades para KDK, artista alternativo/cinematografico en Bogota. Responde SOLO con JSON valido sin markdown.',
        messages: [{
          role: 'user',
          content: 'Resultados de busqueda:\n' + (webResults || 'Sin resultados — usa conocimiento del ecosistema musical LATAM 2025.') + '\n\nResponde con este JSON exacto:\n{"critical":"Una accion que EOS debe tomar ESTA SEMANA (2 oraciones max)","opportunities":[{"title":"Nombre","why":"Relevancia para EOS (1 oracion)","action":"Que hacer exactamente","priority":"high|medium|low","source":"URL si existe"}],"strategy":"Observacion estrategica (2-3 oraciones)","radar":"Tendencia a monitorear (1 oracion)"}'
        }]
      })
    });
    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || '';

    // 3. Parse JSON robusto
    let parsed = { critical: '', opportunities: [], strategy: '', radar: '' };
    try {
      const s = raw.indexOf('{');
      const e = raw.lastIndexOf('}');
      if (s >= 0 && e >= 0) parsed = JSON.parse(raw.slice(s, e+1));
    } catch(pe) { parsed.strategy = raw.slice(0,300); }

    const opps = Array.isArray(parsed.opportunities) ? parsed.opportunities : [];

    // 4. Guardar en Supabase (no-critical — si falla no rompe el agente)
    let savedToMemory = false;
    if (supaUrl && supaKey && opps.length > 0) {
      try {
        await Promise.allSettled(opps.map(o =>
          fetch(supaUrl + '/rest/v1/opportunities', {
            method: 'POST',
            headers: { 'apikey': supaKey, 'Authorization': 'Bearer '+supaKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ title: o.title||'Sin titulo', description: o.why||'', source: o.source||'Scout', priority: o.priority||'medium', status: 'detected', detected_at: new Date().toISOString(), metadata: { action: o.action } })
          })
        ));
        savedToMemory = true;
      } catch(se) {}
    }

    // 5. Telegram (opcional)
    if (tgToken && tgChat && parsed.critical) {
      try {
        await fetch('https://api.telegram.org/bot'+tgToken+'/sendMessage', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: tgChat, text: 'EOS SCOUT\n\nCRITICO: '+parsed.critical+'\n\n'+opps.length+' oportunidades detectadas.', parse_mode: 'HTML' })
        });
      } catch(te) {}
    }

    return res.status(200).json({
      success: true,
      critical: parsed.critical,
      opportunities: opps,
      strategy: parsed.strategy,
      radar: parsed.radar,
      opps: opps.length,
      tavilyUsed,
      savedToMemory,
      timestamp: new Date().toISOString()
    });

  } catch(err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.slice(0,200) });
  }
}