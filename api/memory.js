// api/memory.js — EOS Memory Core v1.0
// Lee y escribe en Supabase. Todas las entidades del proyecto EOS.
// Endpoints: GET /api/memory?table=X&limit=Y | POST /api/memory { table, action, data }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ALLOWED_TABLES = [
  'orkis','projects','songs','contacts','goals',
  'opportunities','ideas','decisions','tasks','memory_logs'
];

async function supabaseQuery(method, table, options = {}) {
  const { filter, data, select = '*', limit, order } = options;
  
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  const params = new URLSearchParams();
  if (select) params.set('select', select);
  if (limit) params.set('limit', limit);
  if (order) params.set('order', order);
  if (filter) {
    for (const [k, v] of Object.entries(filter)) {
      params.set(k, `eq.${v}`);
    }
  }
  if (params.toString()) url += '?' + params.toString();

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} — ${err}`);
  }

  return method === 'DELETE' ? { deleted: true } : res.json();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-claude-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    // ─── GET: leer datos ───────────────────────────────────────────────
    if (req.method === 'GET') {
      const { table, limit = 50, order, filter_key, filter_val, summary } = req.query;

      // Summary especial: estado completo del proyecto para Intelligence Core
      if (summary === 'true') {
        const [orkis, projects, songs, goals, opportunities, tasks, ideas, decisions] =
          await Promise.all([
            supabaseQuery('GET', 'orkis', { select: 'id,name,description', order: 'order_num' }),
            supabaseQuery('GET', 'projects', { select: '*', limit: 10 }),
            supabaseQuery('GET', 'songs', { select: '*', limit: 20 }),
            supabaseQuery('GET', 'goals', { select: '*', order: 'priority', limit: 10 }),
            supabaseQuery('GET', 'opportunities', { select: '*', order: 'detected_at.desc', limit: 20 }),
            supabaseQuery('GET', 'tasks', { select: '*', order: 'due_date', limit: 20 }),
            supabaseQuery('GET', 'ideas', { select: '*', order: 'created_at.desc', limit: 15 }),
            supabaseQuery('GET', 'decisions', { select: '*', order: 'made_at.desc', limit: 10 })
          ]);
        return res.status(200).json({
          success: true,
          summary: { orkis, projects, songs, goals, opportunities, tasks, ideas, decisions },
          timestamp: new Date().toISOString()
        });
      }

      if (!table || !ALLOWED_TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid or missing table', allowed: ALLOWED_TABLES });
      }

      const filter = filter_key && filter_val ? { [filter_key]: filter_val } : undefined;
      const rows = await supabaseQuery('GET', table, { limit, order, filter });
      return res.status(200).json({ success: true, table, rows, count: rows.length });
    }

    // ─── POST: escribir datos ──────────────────────────────────────────
    if (req.method === 'POST') {
      const { table, action, data } = req.body;

      if (!table || !ALLOWED_TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid or missing table', allowed: ALLOWED_TABLES });
      }
      if (!action) return res.status(400).json({ error: 'Missing action (insert|update|delete)' });
      if (!data) return res.status(400).json({ error: 'Missing data' });

      let result;

      if (action === 'insert') {
        // Añadir timestamp si no viene
        if (!data.created_at) data.created_at = new Date().toISOString();
        result = await supabaseQuery('POST', table, { data });

      } else if (action === 'update') {
        if (!data.id) return res.status(400).json({ error: 'update requires data.id' });
        const { id, ...fields } = data;
        fields.updated_at = new Date().toISOString();
        let url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
        const patchRes = await fetch(url, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(fields)
        });
        result = await patchRes.json();

      } else if (action === 'delete') {
        if (!data.id) return res.status(400).json({ error: 'delete requires data.id' });
        result = await supabaseQuery('DELETE', table, { filter: { id: data.id } });

      } else if (action === 'log') {
        // Shortcut para memory_logs — registrar actividad de agentes
        const logEntry = {
          agent: data.agent || 'system',
          event_type: data.event_type || 'note',
          content: data.content,
          orki_id: data.orki_id || null,
          metadata: data.metadata || {},
          created_at: new Date().toISOString()
        };
        result = await supabaseQuery('POST', 'memory_logs', { data: logEntry });

      } else {
        return res.status(400).json({ error: 'Unknown action. Use: insert|update|delete|log' });
      }

      return res.status(200).json({ success: true, action, table, result });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Memory API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
