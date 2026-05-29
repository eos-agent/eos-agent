export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-claude-key, x-tavily-key, x-supabase-url, x-supabase-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.body || {};
  const claudeKey = body.claudeKey || req.headers['x-claude-key'] || process.env.CLAUDE_API_KEY;
  const tavilyKey = body.tavilyKey || req.headers['x-tavily-key'] || process.env.TAVILY_API_KEY;
  const supabaseUrl = body.supabaseUrl || req.headers['x-supabase-url'] || process.env.SUPABASE_URL;
  const supabaseKey = body.supabaseKey || req.headers['x-supabase-key'] || process.env.SUPABASE_SERVICE_KEY;

  if (req.method === 'GET') {
    // Return latest saved trends from Supabase
    if (!supabaseUrl || !supabaseKey) return res.status(200).json({ success: true, trends: [] });
    try {
      const r = await fetch(supabaseUrl + '/rest/v1/ideas?type=eq.trend&order=created_at.desc&limit=15', {
        headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
      });
      const rows = await r.json();
      return res.status(200).json({ success: true, trends: Array.isArray(rows) ? rows : [] });
    } catch(e) {
      return res.status(200).json({ success: true, trends: [] });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.content[0].text;
  }

  async function saveToSupabase(trends) {
    if (!supabaseUrl || !supabaseKey) return false;
    try {
      const rows = trends.map(t => ({
        title: (t.title || 'Trend').substring(0, 200),
        content: ('[' + (t.platform||'General') + '] ' + (t.insight||'') + ' | EOS angle: ' + (t.eos_angle||'')).substring(0, 600),
        type: 'trend',
        status: 'nueva'
      }));
      const r = await fetch(supabaseUrl + '/rest/v1/ideas', {
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
    const queries = [
      'TikTok aesthetic trends cinematic music videos 2025 2026',
      'Instagram Reels emotional storytelling content creators viral 2025',
      'YouTube documentary style music artist behind scenes trending',
      'alternative indie music visual identity red black aesthetic 2025',
      'Latin American artists going viral TikTok emotional content 2025'
    ];

    const results = await Promise.all(queries.map(q => searchWeb(q)));
    const combined = results.map((r, i) => '=== ' + queries[i] + ' ===\n' + r).join('\n\n');

    const prompt = `Eres el Trend Analyzer de EOS (Νέα Αρchή), proyecto musical/documental de KDK en Bogotá.

EOS: música cinematic-alternativa, estética rojo/negro, storytelling documental, mitología griega, vulnerabilidad artística real.

Analiza estos datos de tendencias culturales y digitales:

${combined}

Extrae los 6-8 insights de tendencias más relevantes para EOS. Para cada uno:
- Qué está pasando culturalmente
- Por qué es relevante para EOS específicamente  
- Cómo EOS puede diferenciarse o aprovechar esto

Responde SOLO con JSON válido (array):
[
  {
    "title": "Nombre corto de la tendencia",
    "platform": "TikTok|Instagram|YouTube|Cultural|General",
    "insight": "Qué está pasando y por qué importa para EOS — máx 250 chars",
    "eos_angle": "Cómo EOS puede diferenciarse — máx 150 chars",
    "momentum": "creciendo|estable|bajando"
  }
]

Solo JSON, sin markdown.`;

    const raw = await callClaude(prompt);
    let trends = [];
    try {
      const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
      trends = match ? JSON.parse(match[0]) : [];
    } catch(e) { trends = []; }

    if (trends.length === 0) {
      return res.status(200).json({ success: false, error: 'No trends parsed', raw: raw.substring(0, 300) });
    }

    const saved = await saveToSupabase(trends);

    return res.status(200).json({
      success: true,
      trends: trends.length,
      savedToMemory: saved,
      topTrend: trends[0]?.title,
      data: trends
    });

  } catch(err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.substring(0, 300) });
  }
}