// EOS Agent — Telegram Notify Agent v1.0
// Detecta oportunidades críticas/altas en Supabase y notifica por Telegram
// Anti-spam: usa campo 'status' para no repetir notificaciones

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-token, x-telegram-chat-id, x-supabase-url, x-supabase-key, x-claude-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const TG_TOKEN = req.headers['x-telegram-token'];
  const TG_CHAT  = req.headers['x-telegram-chat-id'];
  const SB_URL   = req.headers['x-supabase-url'];
  const SB_KEY   = req.headers['x-supabase-key'];
  const CLAUDE   = req.headers['x-claude-key'];

  if (!TG_TOKEN || !TG_CHAT) {
    return res.status(400).json({ error: 'Missing x-telegram-token or x-telegram-chat-id' });
  }

  // POST mode: send a specific message directly (for testing)
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const msg = body?.message || '🔴 EOS Agent — test de notificación Telegram activo.';
    const ok = await sendTelegram(TG_TOKEN, TG_CHAT, msg);
    return res.status(200).json({ success: ok, mode: 'direct', message: msg });
  }

  // GET mode: scan Supabase for unnotified critical/high opps
  if (!SB_URL || !SB_KEY) {
    return res.status(400).json({ error: 'Missing Supabase keys for GET mode' });
  }

  try {
    // Fetch pending/new opportunities with critical or high priority
    const oppsRes = await fetch(
      SB_URL + '/rest/v1/opportunities?priority=in.(critical,high)&status=in.(detected,new,pending)&order=created_at.desc&limit=10',
      { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }
    );

    if (!oppsRes.ok) throw new Error('Supabase fetch failed: ' + oppsRes.status);
    const opps = await oppsRes.json();

    if (!opps || opps.length === 0) {
      return res.status(200).json({ success: true, notified: 0, message: 'No pending critical/high opportunities' });
    }

    const notified = [];
    const failed = [];

    for (const opp of opps) {
      try {
        // Build cinematic message
        const priorityEmoji = opp.priority === 'critical' ? '🔴' : '🟠';
        const typeEmoji = {
          festival: '🎪', showcase: '🎭', collaboration: '🤝',
          playlist: '🎵', media: '📰', grant: '💰', residency: '🏠',
          competition: '🏆', networking: '🌐'
        }[opp.type] || '⚡';

        let msg = `${priorityEmoji} *EOS AGENT — OPORTUNIDAD DETECTADA*

${typeEmoji} *${opp.title}*
Prioridad: ${(opp.priority || '').toUpperCase()}  |  Tipo: ${opp.type || 'general'}

`;
        if (opp.why) msg += `📌 *Por qué importa:* ${opp.why}
`;
        if (opp.action) msg += `⚡ *Acción:* ${opp.action}
`;
        if (opp.deadline) msg += `📅 *Deadline:* ${opp.deadline}
`;
        if (opp.source) msg += `🔗 Fuente: ${opp.source}
`;
        msg += `
_EOS Νέα Αρχή — Sistema Operativo Artístico_`;

        const sent = await sendTelegram(TG_TOKEN, TG_CHAT, msg);

        if (sent) {
          // Mark as notified in Supabase
          await fetch(SB_URL + '/rest/v1/opportunities?id=eq.' + opp.id, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SB_KEY,
              'Authorization': 'Bearer ' + SB_KEY,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ status: 'notified' })
          });
          notified.push(opp.id);
        } else {
          failed.push(opp.id);
        }

        // Small delay between messages to avoid Telegram rate limits
        await new Promise(r => setTimeout(r, 800));
      } catch(e) {
        failed.push(opp.id + ': ' + e.message);
      }
    }

    // Send summary if multiple opps
    if (notified.length > 1) {
      const summary = `📊 *EOS RESUMEN:* ${notified.length} oportunidades detectadas esta sesión. El sistema sigue monitoreando.`;
      await sendTelegram(TG_TOKEN, TG_CHAT, summary);
    }

    return res.status(200).json({
      success: true,
      total_found: opps.length,
      notified: notified.length,
      notified_ids: notified,
      failed: failed.length > 0 ? failed : undefined
    });

  } catch(error) {
    console.error('Notify error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function sendTelegram(token, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    const d = await r.json();
    return d.ok === true;
  } catch(e) {
    return false;
  }
}
