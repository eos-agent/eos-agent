// EOS Agent — Competitive Intelligence Agent v1.0
// Analiza artistas similares, detecta brechas de mercado, genera insights estratégicos

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-claude-key, x-tavily-key, x-supabase-url, x-supabase-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const TAVILY_KEY = req.headers['x-tavily-key'];
  const CLAUDE_KEY = req.headers['x-claude-key'];
  const SUPABASE_URL = req.headers['x-supabase-url'];
  const SUPABASE_KEY = req.headers['x-supabase-key'];

  if (!TAVILY_KEY || !CLAUDE_KEY) {
    return res.status(400).json({ error: 'Missing required API keys (Tavily, Claude)' });
  }

  try {
    const searchQueries = [
      'cinematic alternative artists Latin America 2025 documentary storytelling music emerging',
      'alternative indie artists Greek mythology concept album cinematic visual identity',
      'documentary style music artists emotional vulnerability authentic storytelling 2025',
      'emerging alternative artists Bogota Colombia music scene underground 2025',
      'cinematic music artists red aesthetic visual identity alternative emotional'
    ];

    const searchResults = [];
    for (const query of searchQueries) {
      try {
        const tavilyRes = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: TAVILY_KEY, query, search_depth: 'basic', max_results: 4, include_answer: false })
        });
        if (tavilyRes.ok) {
          const data = await tavilyRes.json();
          searchResults.push({ query, results: (data.results || []).map(r => ({ title: r.title, content: r.content?.substring(0,400)||'' })) });
        }
      } catch(e) {}
    }

    const searchContext = searchResults.map(s => 
      'BUSQUEDA: "' + s.query + '"\n' + s.results.map(r => '- ' + r.title + ': ' + r.content).join('\n')
    ).join('\n\n');

    const claudePrompt = `Eres el sistema de Inteligencia Competitiva de EOS Agent.

IDENTIDAD DE EOS: Proyecto artístico cinematic-documental de Bogotá, Colombia.
Estética: rojo/negro, minimalismo futurista, mitología griega.
5 Orkis: Amor no habitado | Culpa por no reciprocidad | Cambio | Paz | Comienzo.
Mercado: LATAM y Europa, alternativos emergentes.

DATOS DE MERCADO:
${searchContext}

Genera análisis JSON con esta estructura exacta:
{
  "market_landscape": { "summary": "...", "key_patterns": ["..."] },
  "competitors": [{ "name":"...", "style":"...", "strengths":"...", "weaknesses":"...", "threat_level":"low|medium|high", "relevance_to_eos":"..." }],
  "market_gaps": [{ "gap":"...", "opportunity":"...", "orki_alignment":"...", "priority":"low|medium|high|critical" }],
  "oversaturated": ["..."],
  "eos_differentiation": { "unique_position":"...", "key_advantages":["..."], "strategic_recommendations":[{ "action":"...", "rationale":"...", "timeline":"inmediato|1-3 meses|3-6 meses" }] },
  "intelligence_score": { "market_saturation":0, "eos_differentiation_potential":0, "opportunity_density":0 }
}

Responde SOLO JSON válido sin markdown.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 3000, messages: [{ role: 'user', content: claudePrompt }] })
    });

    if (!claudeRes.ok) throw new Error('Claude API error: ' + claudeRes.status);
    const claudeData = await claudeRes.json();
    const rawText = claudeData.content[0].text.trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
    const analysis = JSON.parse(rawText);

    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const ideas = [
          ...(analysis.market_gaps||[]).map(g => ({ title: '[INTEL] ' + g.gap, content: 'OPORTUNIDAD: ' + g.opportunity + '\nORKI: ' + g.orki_alignment + '\nPRIORIDAD: ' + g.priority, type: 'competitive_gap', status: 'detected' })),
          ...(analysis.eos_differentiation?.strategic_recommendations||[]).map(r => ({ title: '[ESTRATEGIA] ' + r.action, content: 'RAZÓN: ' + r.rationale + '\nTIMELINE: ' + r.timeline, type: 'strategic_recommendation', status: 'detected' }))
        ];
        if (ideas.length > 0) {
          await fetch(SUPABASE_URL + '/rest/v1/ideas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=minimal' },
            body: JSON.stringify(ideas)
          });
        }
      } catch(e) {}
    }

    return res.status(200).json({ success: true, generated_at: new Date().toISOString(), analysis, saved_to_memory: !!(SUPABASE_URL && SUPABASE_KEY) });
  } catch(error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}