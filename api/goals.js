// EOS Agent — Goals API v1.0
// GET: lista objetivos | POST: crea objetivo | PATCH: actualiza progreso/status

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-supabase-url, x-supabase-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_URL = req.headers['x-supabase-url'];
  const SB_KEY = req.headers['x-supabase-key'];
  if (!SB_URL || !SB_KEY) return res.status(400).json({ error: 'Missing Supabase keys' });

  const headers = { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  try {
    // GET — fetch all active goals
    if (req.method === 'GET') {
      const r = await fetch(SB_URL + '/rest/v1/goals?order=priority.desc,created_at.asc', { headers });
      if (!r.ok) throw new Error('Supabase error: ' + r.status);
      const goals = await r.json();
      return res.status(200).json({ success: true, goals, count: goals.length });
    }

    // POST — create new goal
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body.title) return res.status(400).json({ error: 'title required' });
      const payload = {
        title: body.title,
        description: body.description || '',
        priority: body.priority || 'medium',
        status: body.status || 'active',
        target_date: body.target_date || null,
        project_id: body.project_id || null
      };
      const r = await fetch(SB_URL + '/rest/v1/goals', {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      return res.status(201).json({ success: true, goal: Array.isArray(data) ? data[0] : data });
    }

    // PATCH — update goal status or progress
    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body.id) return res.status(400).json({ error: 'id required' });
      const payload = {};
      if (body.status) payload.status = body.status;
      if (body.priority) payload.priority = body.priority;
      if (body.description !== undefined) payload.description = body.description;
      if (body.target_date !== undefined) payload.target_date = body.target_date;
      const r = await fetch(SB_URL + '/rest/v1/goals?id=eq.' + body.id, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(payload)
      });
      return res.status(200).json({ success: r.ok, updated_id: body.id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
