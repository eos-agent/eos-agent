// api/outreach.js — EOS Outreach Agent v1.0
// Redacta emails/propuestas para oportunidades detectadas por Scout.
// KDK siempre aprueba antes de enviar — nunca envío automático.

async function askClaude(key, system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 1500, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text || '';
}

async function getOpportunities(supaUrl, supaKey) {
  const r = await fetch(supaUrl + '/rest/v1/opportunities?select=*&status=eq.detected&limit=10&order=detected_at.desc', {
    headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey }
  });
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

async function markOutreachDrafted(supaUrl, supaKey, oppId) {
  await fetch(supaUrl + '/rest/v1/opportunities?id=eq.' + oppId, {
    method: 'PATCH',
    headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ status: 'outreach_drafted', updated_at: new Date().toISOString() })
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-claude-key,x-supabase-url,x-supabase-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.body || {};
  const claudeKey = req.headers['x-claude-key'] || body.claudeKey;
  const supaUrl   = req.headers['x-supabase-url'] || body.supabaseUrl || process.env.SUPABASE_URL;
  const supaKey   = req.headers['x-supabase-key'] || body.supabaseKey || process.env.SUPABASE_SERVICE_KEY;

  if (!claudeKey) return res.status(400).json({ error: 'Missing claudeKey' });

  // GET — listar oportunidades pendientes de outreach
  if (req.method === 'GET') {
    if (!supaUrl || !supaKey) return res.status(400).json({ error: 'Missing Supabase keys' });
    try {
      const opps = await getOpportunities(supaUrl, supaKey);
      return res.status(200).json({ success: true, opportunities: opps, count: opps.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — generar draft de email para una oportunidad
  if (req.method === 'POST') {
    const { opportunityId, opportunityTitle, opportunityDescription, customContext } = body;

    if (!opportunityTitle && !opportunityId) {
      return res.status(400).json({ error: 'Provide opportunityId or opportunityTitle' });
    }

    const system = `Eres el Outreach Agent de EOS — redactas emails y propuestas profesionales para KDK, artista alternativo/cinematografico de Bogota.

IDENTIDAD DE EOS:
- Proyecto: EOS / Nea Arche (nuevo comienzo)
- Musica alternativa/cinematografica, documental del proceso
- Estetica rojo/negro, influencias griegas, storytelling real
- 5 Orkis emocionales: Amor no habitado, Culpa, Cambio, Paz, Comienzo
- Enfoque: crecimiento organico, autenticidad, vulnerabilidad artistica

ESTILO DE ESCRITURA:
- Profesional pero humano, nunca corporativo
- Breve y directo (max 200 palabras en el email)
- Muestra el proyecto claramente, no sobre-vende
- En espanol a menos que se indique otro idioma`;

    const prompt = `Redacta un email profesional para esta oportunidad:

OPORTUNIDAD: ${opportunityTitle || opportunityId}
DESCRIPCION: ${opportunityDescription || 'Sin descripcion adicional'}
CONTEXTO ADICIONAL: ${customContext || 'Ninguno'}

Genera el email con este formato JSON exacto:
{
  "subject": "Asunto del email (corto, directo)",
  "to": "destinatario@ejemplo.com (si se conoce, sino dejar vacio)",
  "body": "Cuerpo completo del email (200 palabras max, profesional y humano)",
  "followUp": "Mensaje de seguimiento para enviar 1 semana despues si no hay respuesta (100 palabras max)",
  "tips": "Consejo estrategico para esta oportunidad especifica (1-2 oraciones)"
}`;

    try {
      const raw = await askClaude(claudeKey, system, prompt);
      
      let draft = {};
      try {
        const s = raw.indexOf('{');
        const e = raw.lastIndexOf('}');
        if (s >= 0 && e >= 0) draft = JSON.parse(raw.slice(s, e+1));
      } catch(pe) { draft = { body: raw, subject: 'EOS — ' + (opportunityTitle || 'Propuesta') }; }

      // Marcar oportunidad como drafted en Supabase (si tenemos ID y keys)
      if (opportunityId && supaUrl && supaKey) {
        try { await markOutreachDrafted(supaUrl, supaKey, opportunityId); } catch(e) {}
      }

      return res.status(200).json({
        success: true,
        draft,
        opportunity: opportunityTitle,
        warning: 'REVISION REQUERIDA — Este email NO se envia automaticamente. KDK debe revisar y aprobar antes de enviar.',
        timestamp: new Date().toISOString()
      });

    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}