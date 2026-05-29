// api/intel.js — EOS Intelligence Core v1.2
// Fix: Array.isArray guards + model correcto + mejor error handling

async function getMemory(supaUrl, supaKey) {
  const h = { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey };
  const get = async (path) => {
    try {
      const r = await fetch(supaUrl + '/rest/v1/' + path, { headers: h });
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    } catch(e) { return []; }
  };
  return {
    orkis:         await get('orkis?select=id,name,description&order=order_num'),
    projects:      await get('projects?select=name,status&limit=10'),
    songs:         await get('songs?select=title,status&limit=20'),
    contacts:      await get('contacts?select=name,role&limit=10'),
    goals:         await get('goals?select=title,priority,status&limit=10'),
    opportunities: await get('opportunities?select=title,priority&limit=15&order=detected_at.desc'),
    tasks:         await get('tasks?select=title,status,due_date&limit=15'),
    ideas:         await get('ideas?select=title,content&limit=10&order=created_at.desc'),
    logs:          await get('memory_logs?select=agent,event_type,created_at&limit=10&order=created_at.desc')
  };
}

async function askClaude(key, system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 1500, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.content?.[0]?.text || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-claude-key,x-supabase-url,x-supabase-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const claudeKey = req.headers['x-claude-key'];
  const supaUrl   = req.headers['x-supabase-url'] || process.env.SUPABASE_URL;
  const supaKey   = req.headers['x-supabase-key'] || process.env.SUPABASE_SERVICE_KEY;

  if (!claudeKey) return res.status(400).json({ error: 'Missing x-claude-key' });
  if (!supaUrl || !supaKey) return res.status(400).json({ error: 'Missing Supabase keys' });

  try {
    const m = await getMemory(supaUrl, supaKey);
    const question = req.query?.question || (req.body && req.body.question) || 'brief';

    const safeList = (arr, fn) => Array.isArray(arr) ? arr.map(fn).filter(Boolean).join(', ') || 'ninguno' : 'ninguno';

    const ctx = [
      'ORKIS: ' + safeList(m.orkis, o => o.id + '. ' + o.name),
      'PROYECTOS: ' + safeList(m.projects, p => p.name),
      'CANCIONES: ' + safeList(m.songs, s => s.title),
      'EQUIPO: ' + safeList(m.contacts, c => c.name + ' (' + c.role + ')'),
      'OBJETIVOS: ' + safeList(m.goals, g => g.title),
      'OPORTUNIDADES: ' + safeList(m.opportunities, o => o.title),
      'TAREAS ACTIVAS: ' + safeList(m.tasks.filter(t => t.status !== 'done'), t => t.title),
      'IDEAS: ' + safeList(m.ideas, i => i.title || i.content?.slice(0,50)),
      'ACTIVIDAD RECIENTE: ' + safeList(m.logs, l => l.agent + ':' + l.event_type)
    ].join('\n');

    const system = 'Eres el Intelligence Core de EOS Agent — cerebro del proyecto artístico de KDK en Bogotá. Responde directo, estratégico, en español. Máximo 300 palabras.';

    let prompt;
    if (question === 'brief') {
      prompt = 'Brief de hoy (7 puntos numerados, 1-3 oraciones cada uno):\n1. ¿Qué está pasando?\n2. ¿Qué es importante hoy?\n3. ¿Qué oportunidades hay?\n4. ¿Qué riesgos existen?\n5. ¿Qué deberías hacer ahora?\n6. ¿Qué proyectos avanzan?\n7. ¿Qué decisiones están pendientes?\n\nMEMORIA:\n' + ctx;
    } else {
      prompt = 'Pregunta: "' + question + '"\n\nMEMORIA:\n' + ctx;
    }

    const analysis = await askClaude(claudeKey, system, prompt);

    // Log silencioso — no crashear si falla
    try {
      await fetch(supaUrl + '/rest/v1/memory_logs', {
        method: 'POST',
        headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ agent: 'intel', event_type: 'brief', content: question, metadata: {}, created_at: new Date().toISOString() })
      });
    } catch(e) {}

    return res.status(200).json({ success: true, question, analysis, snapshot: { orkis: m.orkis.length, projects: m.projects.length, songs: m.songs.length, opportunities: m.opportunities.length }, timestamp: new Date().toISOString() });

  } catch(err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.slice(0,300) });
  }
}