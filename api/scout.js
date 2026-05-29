export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-claude-key, x-tavily-key, x-supabase-url, x-supabase-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const claudeKey = body.claudeKey || req.headers['x-claude-key'] || process.env.CLAUDE_API_KEY;
  const tavilyKey = body.tavilyKey || req.headers['x-tavily-key'] || process.env.TAVILY_API_KEY;
  const supabaseUrl = body.supabaseUrl || req.headers['x-supabase-url'] || process.env.SUPABASE_URL;
  const supabaseKey = body.supabaseKey || req.headers['x-supabase-key'] || process.env.SUPABASE_SERVICE_KEY;

  if (!claudeKey) return res.status(400).json({ error: 'Missing claudeKey' });
  if (!tavilyKey) return res.status(400).json({ error: 'Missing tavilyKey' });

  async function searchWeb(query) {
    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: 5, search_depth: 'basic' })
      });
      const d = await r.json();
      return (d.results || []).map(x => x.title + ': ' + x.content).join('\n\n');
    } catch(e) { return ''; }
  }

  async function callClaude(prompt) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.content[0].text;
  }

  async function saveToSupabase(opps) {
    if (!supabaseUrl || !supabaseKey) return false;
    try {
      // Map to exact Supabase schema: id, title, type, priority, status, deadline, why, action, source, orki_id
      const rows = opps.map(o => ({
        title: (o.title || 'Oportunidad sin título').substring(0, 200),
        type: o.type || 'general',
        priority: o.priority === 'alta' ? 'alta' : o.priority === 'baja' ? 'baja' : 'media',
        status: 'nueva',
        deadline: o.deadline || null,
        why: (o.why || o.description || o.reason || '').substring(0, 500),
        action: (o.action || o.recommended_action || '').substring(0, 300),
        source: 'Scout Agent v2.6 / Tavily'
      }));

      const r = await fetch(supabaseUrl + '/rest/v1/opportunities', {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(rows)
      });
      return r.status === 201 || r.status === 200;
    } catch(e) { return false; }
  }

  try {
    // Search for opportunities
    const queries = [
      'convocatorias festivales música emergente Colombia LATAM 2025 2026',
      'open calls showcases artistas alternativos Bogotá Medellín 2025',
      'music grants funding emerging artists Latin America 2025',
      'playlists editoriales Spotify nuevos artistas latinoamericanos',
      'blogs medios música alternativa cinematic Colombia entrevistas'
    ];

    const searchResults = await Promise.all(queries.map(q => searchWeb(q)));
    const combinedResults = searchResults.map((r, i) => `=== Búsqueda ${i+1}: ${queries[i]} ===\n${r}`).join('\n\n');

    const prompt = `Eres el Scout Agent de EOS (Νέα Αρχή), proyecto musical/documental de KDK basado en Bogotá.

EOS es: música cinematic-alternativa, estética rojo/negro, storytelling documental, inspiración mitología griega, artista emergente.

Analiza estos resultados de búsqueda y extrae las 6-8 mejores oportunidades reales y accionables:

${combinedResults}

Responde SOLO con JSON válido (array):
[
  {
    "title": "Nombre específico de la oportunidad",
    "type": "festival|showcase|playlist|media|grant|collaboration|other",
    "priority": "alta|media|baja",
    "deadline": "YYYY-MM-DD o null",
    "why": "Por qué es perfecta para EOS — máx 200 chars",
    "action": "Acción específica que KDK debe tomar — máx 150 chars"
  }
]

Solo JSON, sin markdown, sin explicaciones.`;

    const raw = await callClaude(prompt);
    
    // Parse JSON from Claude response
    let opps = [];
    try {
      const jsonMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
      opps = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch(e) {
      opps = [];
    }

    if (opps.length === 0) {
      return res.status(200).json({ success: false, error: 'No opportunities parsed', raw: raw.substring(0, 200) });
    }

    const savedToMemory = await saveToSupabase(opps);
    const critical = opps.find(o => o.priority === 'alta');

    return res.status(200).json({
      success: true,
      opps: opps.length,
      savedToMemory,
      critical: critical ? critical.action : null,
      opportunities: opps
    });

  } catch(err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.substring(0, 300) });
  }
}