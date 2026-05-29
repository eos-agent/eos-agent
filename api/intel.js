// api/intel.js — EOS Intelligence Core v1.0
// Lee TODA la memoria de Supabase y responde las 7 preguntas fundamentales.
// Usa Claude para síntesis estratégica sobre datos reales del proyecto.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function getFullMemory() {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  const base = SUPABASE_URL + '/rest/v1';
  const q = (table, params='select=*&limit=30') =>
    fetch(`${base}/${table}?${params}`, { headers }).then(r=>r.json());

  const [orkis, projects, songs, contacts, goals, opportunities, ideas, decisions, tasks, logs] =
    await Promise.all([
      q('orkis','select=id,name,description&order=order_num'),
      q('projects'),
      q('songs'),
      q('contacts'),
      q('goals','select=*&order=priority&limit=10'),
      q('opportunities','select=*&order=detected_at.desc&limit=20'),
      q('ideas','select=*&order=created_at.desc&limit=15'),
      q('decisions','select=*&order=made_at.desc&limit=10'),
      q('tasks','select=*&order=due_date&limit=20'),
      q('memory_logs','select=*&order=created_at.desc&limit=30')
    ]);

  return { orkis, projects, songs, contacts, goals, opportunities, ideas, decisions, tasks, logs };
}

async function callClaude(apiKey, systemPrompt, userPrompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  const data = await r.json();
  return data.content?.[0]?.text || 'No response';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-claude-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const claudeKey = req.headers['x-claude-key'] || req.body?.claudeKey;
  if (!claudeKey) return res.status(400).json({ error: 'Missing x-claude-key header' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    // Cargar memoria completa
    const memory = await getFullMemory();

    // Construir contexto para Claude
    const memoryContext = `
=== EOS MEMORY CORE — CONTEXTO COMPLETO ===

PROYECTO: EOS / Νέα Αρχή — proyecto artístico y musical de KDK en Bogotá, LATAM.
Documenta transformación personal real. Estética rojo/negro, cinematic, griego.

LOS 5 ORKIS (alma emocional del proyecto):
${memory.orkis.map(o=>`  ${o.id}. ${o.name}: ${o.description}`).join('\n')}

PROYECTOS ACTIVOS:
${JSON.stringify(memory.projects, null, 2)}

CANCIONES:
${JSON.stringify(memory.songs, null, 2)}

CONTACTOS / EQUIPO:
${JSON.stringify(memory.contacts, null, 2)}

OBJETIVOS:
${JSON.stringify(memory.goals, null, 2)}

OPORTUNIDADES DETECTADAS:
${JSON.stringify(memory.opportunities, null, 2)}

IDEAS PENDIENTES:
${JSON.stringify(memory.ideas, null, 2)}

DECISIONES TOMADAS:
${JSON.stringify(memory.decisions, null, 2)}

TAREAS:
${JSON.stringify(memory.tasks, null, 2)}

ACTIVIDAD RECIENTE (logs):
${JSON.stringify(memory.logs.slice(0,10), null, 2)}
=== FIN MEMORIA ===
`;

    const systemPrompt = `Eres el Intelligence Core de EOS Agent — el sistema nervioso central de un proyecto artístico llamado EOS (Νέα Αρchή) de KDK, artista en Bogotá.
Tu función es analizar la memoria completa del proyecto y responder de forma concisa, estratégica y accionable.
Hablas directamente a KDK, de forma directa, inteligente y artística — no corporativa.
Siempre en español. Máximo 300 palabras por respuesta. Prioriza acción sobre análisis.`;

    // Determinar qué preguntas responder
    const question = (req.method === 'POST' ? req.body?.question : req.query?.question) || 'brief';

    let userPrompt;
    if (question === 'brief') {
      userPrompt = `Con base en esta memoria, dame el brief de hoy. Responde las 7 preguntas clave:
1. ¿Qué está pasando en el proyecto?
2. ¿Qué es importante hoy?
3. ¿Qué oportunidades detectamos?
4. ¿Qué riesgos existen?
5. ¿Qué deberías hacer ahora?
6. ¿Qué proyectos están avanzando?
7. ¿Qué decisiones siguen pendientes?

Sé directo. Formato: 7 bloques numerados, cada uno 1-3 oraciones.

${memoryContext}`;
    } else {
      userPrompt = `Pregunta de KDK: "${question}"

Responde usando la memoria completa del proyecto:

${memoryContext}`;
    }

    const analysis = await callClaude(claudeKey, systemPrompt, userPrompt);

    // Log de actividad
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/memory_logs`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          agent: 'intelligence_core',
          event_type: 'brief_generated',
          content: question,
          metadata: { question, response_length: analysis.length },
          created_at: new Date().toISOString()
        })
      });
    } catch(e) { /* non-fatal */ }

    return res.status(200).json({
      success: true,
      question,
      analysis,
      memory_snapshot: {
        projects: memory.projects.length,
        songs: memory.songs.length,
        opportunities: memory.opportunities.length,
        tasks: memory.tasks.length,
        ideas: memory.ideas.length,
        goals: memory.goals.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Intel Core error:', err);
    return res.status(500).json({ error: err.message });
  }
}
