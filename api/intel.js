// api/intel.js — EOS Intelligence Core v1.1
// Lee toda la memoria Supabase y responde las 7 preguntas clave con Claude.
// Acepta keys del cliente via headers.

async function getFullMemory(supaUrl, supaKey) {
  const headers = { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Content-Type': 'application/json' };
  const base = supaUrl + '/rest/v1';
  const q = (table, params) => fetch(base + '/' + table + '?' + (params||'select=*&limit=30'), { headers }).then(r=>r.json());

  const [orkis, projects, songs, contacts, goals, opportunities, ideas, decisions, tasks, logs] = await Promise.all([
    q('orkis','select=id,name,description&order=order_num'),
    q('projects'),
    q('songs'),
    q('contacts'),
    q('goals','select=*&order=priority&limit=10'),
    q('opportunities','select=*&order=detected_at.desc&limit=20'),
    q('ideas','select=*&order=created_at.desc&limit=15'),
    q('decisions','select=*&order=made_at.desc&limit=10'),
    q('tasks','select=*&order=due_date&limit=20'),
    q('memory_logs','select=*&order=created_at.desc&limit=20')
  ]);
  return { orkis, projects, songs, contacts, goals, opportunities, ideas, decisions, tasks, logs };
}

async function callClaude(apiKey, system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 1500, system, messages: [{ role: 'user', content: user }] })
  });
  const data = await r.json();
  return data.content?.[0]?.text || JSON.stringify(data.error || 'No response');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-claude-key,x-supabase-url,x-supabase-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const claudeKey = req.headers['x-claude-key'] || (req.body && req.body.claudeKey);
  const supaUrl   = req.headers['x-supabase-url'] || process.env.SUPABASE_URL;
  const supaKey   = req.headers['x-supabase-key'] || process.env.SUPABASE_SERVICE_KEY;

  if (!claudeKey) return res.status(400).json({ error: 'Missing x-claude-key' });
  if (!supaUrl || !supaKey) return res.status(400).json({ error: 'Missing Supabase keys' });

  try {
    const memory = await getFullMemory(supaUrl, supaKey);

    const ctx = `=== EOS MEMORY CORE ===
PROYECTO: EOS / Νέα Αρχή — artista KDK en Bogotá, Colombia.
Documental artístico real. Estética rojo/negro/cinematic. Crecimiento orgánico.

5 ORKIS: ${memory.orkis.map(o=>o.id+'. '+o.name).join(' | ')}
PROYECTOS: ${memory.projects.map(p=>p.name).join(', ')}
CANCIONES: ${memory.songs.map(s=>s.title||s.name).join(', ')}
EQUIPO: ${memory.contacts.map(c=>c.name+' ('+c.role+')').join(', ')}
OBJETIVOS: ${memory.goals.map(g=>g.title||g.description).join('; ')}
OPORTUNIDADES RECIENTES: ${memory.opportunities.slice(0,5).map(o=>o.title).join(', ')||'ninguna aún'}
TAREAS: ${memory.tasks.filter(t=>t.status!=='done').slice(0,5).map(t=>t.title).join(', ')||'ninguna'}
IDEAS: ${memory.ideas.slice(0,5).map(i=>i.title||i.content).join(', ')||'ninguna'}
LOGS RECIENTES: ${memory.logs.slice(0,5).map(l=>l.agent+': '+l.event_type).join(', ')}
=== FIN ===`;

    const question = (req.method==='POST'?req.body?.question:null) || req.query?.question || 'brief';

    const systemPrompt = `Eres el Intelligence Core de EOS Agent — cerebro del proyecto artístico de KDK en Bogotá.
Analiza su memoria y responde de forma directa, estratégica y en español. Máximo 300 palabras.`;

    let userPrompt;
    if (question === 'brief') {
      userPrompt = `Brief de hoy con base en la memoria del proyecto:
1. ¿Qué está pasando?
2. ¿Qué es importante hoy?
3. ¿Qué oportunidades hay?
4. ¿Qué riesgos existen?
5. ¿Qué deberías hacer ahora?
6. ¿Qué proyectos avanzan?
7. ¿Qué decisiones están pendientes?

Sé directo. 7 bloques numerados de 1-3 oraciones cada uno.

MEMORIA:
${ctx}`;
    } else {
      userPrompt = 'Pregunta de KDK: "' + question + '"

MEMORIA:
' + ctx;
    }

    const analysis = await callClaude(claudeKey, systemPrompt, userPrompt);

    // Log silencioso
    try {
      await fetch(supaUrl + '/rest/v1/memory_logs', {
        method: 'POST',
        headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ agent: 'intelligence_core', event_type: 'brief_generated', content: question, metadata: { length: analysis.length }, created_at: new Date().toISOString() })
      });
    } catch(e) {}

    return res.status(200).json({
      success: true,
      question,
      analysis,
      snapshot: { projects: memory.projects.length, songs: memory.songs.length, opportunities: memory.opportunities.length, tasks: memory.tasks.length },
      timestamp: new Date().toISOString()
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}