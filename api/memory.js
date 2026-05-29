// api/memory.js — EOS Memory Core v1.1
// Acepta Supabase keys del cliente (header x-supabase-key) con fallback a env vars.

const ALLOWED_TABLES = [
  'orkis','projects','songs','contacts','goals',
  'opportunities','ideas','decisions','tasks','memory_logs'
];

async function supabaseQuery(supaUrl, supaKey, method, table, options = {}) {
  const { filter, data, select = '*', limit, order } = options;
  let url = supaUrl + '/rest/v1/' + table;
  const params = new URLSearchParams();
  if (select) params.set('select', select);
  if (limit) params.set('limit', String(limit));
  if (order) params.set('order', order);
  if (filter) for (const [k,v] of Object.entries(filter)) params.set(k, 'eq.' + v);
  if (params.toString()) url += '?' + params.toString();

  const headers = {
    'apikey': supaKey,
    'Authorization': 'Bearer ' + supaKey,
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
    throw new Error('Supabase ' + method + ' ' + table + ': ' + res.status + ' — ' + err);
  }
  return method === 'DELETE' ? { deleted: true } : res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-supabase-url,x-supabase-key,x-claude-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Keys: header > env var
  const supaUrl = req.headers['x-supabase-url'] || process.env.SUPABASE_URL;
  const supaKey = req.headers['x-supabase-key'] || process.env.SUPABASE_SERVICE_KEY;

  if (!supaUrl || !supaKey) {
    return res.status(400).json({ error: 'Missing Supabase keys. Send x-supabase-url and x-supabase-key headers.' });
  }

  try {
    if (req.method === 'GET') {
      const { table, limit = 50, order, filter_key, filter_val, summary } = req.query;

      if (summary === 'true') {
        const [orkis, projects, songs, goals, opportunities, tasks, ideas, decisions] = await Promise.all([
          supabaseQuery(supaUrl, supaKey, 'GET', 'orkis', { select: 'id,name,description', order: 'order_num' }),
          supabaseQuery(supaUrl, supaKey, 'GET', 'projects', { limit: 10 }),
          supabaseQuery(supaUrl, supaKey, 'GET', 'songs', { limit: 20 }),
          supabaseQuery(supaUrl, supaKey, 'GET', 'goals', { order: 'priority', limit: 10 }),
          supabaseQuery(supaUrl, supaKey, 'GET', 'opportunities', { order: 'detected_at.desc', limit: 20 }),
          supabaseQuery(supaUrl, supaKey, 'GET', 'tasks', { order: 'due_date', limit: 20 }),
          supabaseQuery(supaUrl, supaKey, 'GET', 'ideas', { order: 'created_at.desc', limit: 15 }),
          supabaseQuery(supaUrl, supaKey, 'GET', 'decisions', { order: 'made_at.desc', limit: 10 })
        ]);
        return res.status(200).json({ success: true, summary: { orkis, projects, songs, goals, opportunities, tasks, ideas, decisions }, timestamp: new Date().toISOString() });
      }

      if (!table || !ALLOWED_TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid table', allowed: ALLOWED_TABLES });
      }
      const filter = filter_key && filter_val ? { [filter_key]: filter_val } : undefined;
      const rows = await supabaseQuery(supaUrl, supaKey, 'GET', table, { limit, order, filter });
      return res.status(200).json({ success: true, table, rows, count: rows.length });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const table = body.table;
      const action = body.action;
      const data = body.data;

      if (!table || !ALLOWED_TABLES.includes(table)) return res.status(400).json({ error: 'Invalid table' });
      if (!action) return res.status(400).json({ error: 'Missing action' });
      if (!data) return res.status(400).json({ error: 'Missing data' });

      let result;
      if (action === 'insert') {
        if (!data.created_at) data.created_at = new Date().toISOString();
        result = await supabaseQuery(supaUrl, supaKey, 'POST', table, { data });
      } else if (action === 'log') {
        const entry = { agent: data.agent||'system', event_type: data.event_type||'note', content: data.content, orki_id: data.orki_id||null, metadata: data.metadata||{}, created_at: new Date().toISOString() };
        result = await supabaseQuery(supaUrl, supaKey, 'POST', 'memory_logs', { data: entry });
      } else if (action === 'update') {
        if (!data.id) return res.status(400).json({ error: 'update requires id' });
        const { id, ...fields } = data;
        fields.updated_at = new Date().toISOString();
        const patchUrl = supaUrl + '/rest/v1/' + table + '?id=eq.' + id;
        const pr = await fetch(patchUrl, { method:'PATCH', headers:{'apikey':supaKey,'Authorization':'Bearer '+supaKey,'Content-Type':'application/json','Prefer':'return=representation'}, body:JSON.stringify(fields) });
        result = await pr.json();
      } else {
        return res.status(400).json({ error: 'Unknown action' });
      }
      return res.status(200).json({ success: true, action, table, result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}