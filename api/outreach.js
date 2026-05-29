export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-claude-key, x-supabase-url, x-supabase-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const claudeKey = req.headers['x-claude-key'] || process.env.CLAUDE_API_KEY;
  const supabaseUrl = req.headers['x-supabase-url'] || process.env.SUPABASE_URL;
  const supabaseKey = req.headers['x-supabase-key'] || process.env.SUPABASE_SERVICE_KEY;

  if (!claudeKey) return res.status(400).json({ error: 'Missing claudeKey' });

  // GET — return all opportunities for outreach (status != outreach_drafted)
  if (req.method === 'GET') {
    if (!supabaseUrl || !supabaseKey) {
      return res.status(200).json({ success: true, opportunities: [] });
    }
    try {
      const r = await fetch(
        supabaseUrl + '/rest/v1/opportunities?status=neq.outreach_drafted&order=created_at.desc&limit=20',
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': 'Bearer ' + supabaseKey
          }
        }
      );
      const opps = await r.json();
      return res.status(200).json({ success: true, opportunities: Array.isArray(opps) ? opps : [] });
    } catch(e) {
      return res.status(200).json({ success: true, opportunities: [] });
    }
  }

  // POST — generate email draft for an opportunity
  if (req.method === 'POST') {
    const { opportunityId, title, description } = req.body || {};
    
    // Get opportunity details from Supabase if we have an ID
    let opp = { title: title || 'Oportunidad', why: description || '', action: '' };
    
    if (opportunityId && supabaseUrl && supabaseKey) {
      try {
        const r = await fetch(
          supabaseUrl + '/rest/v1/opportunities?id=eq.' + opportunityId,
          { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
        );
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0]) opp = rows[0];
      } catch(e) {}
    }

    const prompt = `Eres el Outreach Agent de EOS (Νέα Αρχή), proyecto musical/documental cinematic de un artista emergente de Bogotá, Colombia.
DATOS OFICIALES DEL ARTISTA:
- Proyecto: EOS / Νέα Αρχή
- Email oficial de contacto: eosscontactt@gmail.com (SIEMPRE usar este email en firmas y datos de contacto)
- Ciudad: Bogotá, Colombia
- Estética: cinematográfica, rojo/negro, inspiración mitología griega, documental emocional

OPORTUNIDAD A LA QUE APLICAR:
Título: ${opp.title}
Por qué es relevante: ${opp.why || description || ''}
Acción requerida: ${opp.action || ''}

Escribe un email profesional, auténtico y artístico para postular/contactar sobre esta oportunidad.

El email debe:
- Sonar genuino y artístico, NO corporativo
- Presentar EOS: proyecto musical/documental cinematic, estética rojo/negro, inspirado en mitología griega, storytelling documental real
- Ser conciso (máx 250 palabras)
- Incluir asunto del email al inicio en formato "ASUNTO: ..."
- Terminar con firma: KDK / EOS — Νέα Αρchή / eos-agent.vercel.app

Escribe solo el email (asunto + cuerpo), sin explicaciones adicionales.`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error.message);
      
      const fullDraft = data.content[0].text;
      
      // Extract subject line
      const subjectMatch = fullDraft.match(/ASUNTO:\s*(.+)/i);
      const subject = subjectMatch ? subjectMatch[1].trim() : (opp.title || 'Propuesta EOS');
      const body = fullDraft.replace(/ASUNTO:\s*.+\n?/i, '').trim();

      // Mark opportunity as outreach_drafted in Supabase
      if (opportunityId && supabaseUrl && supabaseKey) {
        try {
          await fetch(supabaseUrl + '/rest/v1/opportunities?id=eq.' + opportunityId, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': 'Bearer ' + supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'outreach_drafted' })
          });
        } catch(e) {}
      }

      return res.status(200).json({
        success: true,
        subject,
        draft: body,
        warning: 'REVISION REQUERIDA — Este email NO se envia automaticamente. Revisa, edita y envia manualmente.'
      });

    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}