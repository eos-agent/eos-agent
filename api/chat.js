// ═══════════════════════════════════════════════════════
//  EOS AGENT — /api/chat
//  Endpoint de chat para el dashboard. Permite que
//  eos-agent.html llame al backend (evita CORS con
//  Anthropic API key expuesta en browser).
//  También acepta mensajes de Telegram via webhook.
// ═══════════════════════════════════════════════════════

const { searchWeb, formatSearch, callClaude, sendTelegram, handleCors, checkAuth } = require('./_utils');

// Keywords que indican búsqueda web necesaria
const WEB_KEYWORDS = [
  'busca','encuentra','qué hay','festival','showcase','convocatoria',
  'evento','noticias','tendencia','tiktok','instagram','viral','hoy',
  'esta semana','este mes','actualmente','reciente','nuevo','últimas',
  'blog','playlist','medio','bogotá','colombia','latam','quién es'
];

function needsSearch(q) {
  const l = q.toLowerCase();
  return WEB_KEYWORDS.some(kw => l.includes(kw));
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  // ── TELEGRAM WEBHOOK MODE ─────────────────────────────
  // n8n o Telegram envía mensajes aquí
  if (req.body?.message) {
    const msg = req.body.message;
    const text = msg.text || '';
    const chatId = msg.chat?.id?.toString();
    if (!text || !chatId) return res.status(200).json({ ok: true });

    // Remove /eos command prefix if present
    const query = text.replace(/^\/eos\s*/i, '').trim();
    if (!query) return res.status(200).json({ ok: true });

    try {
      let webCtx = '';
      if (needsSearch(query)) {
        const searchData = await searchWeb(query, { maxResults: 5, includeAnswer: true });
        if (searchData) webCtx = formatSearch(searchData, query);
      }
      const reply = await callClaude(query, webCtx, 600);
      await sendTelegram(reply, chatId);
    } catch (e) {
      await sendTelegram(`❌ Error: ${e.message}`, chatId).catch(() => {});
    }
    return res.status(200).json({ ok: true });
  }

  // ── API CHAT MODE ─────────────────────────────────────
  // Dashboard llama a este endpoint
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { query, history = [] } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    let webCtx = '';
    if (needsSearch(query)) {
      const searchData = await searchWeb(query, { maxResults: 5, includeAnswer: true });
      if (searchData) webCtx = formatSearch(searchData, query);
    }

    const reply = await callClaude(
      query,
      webCtx,
      800
    );

    return res.status(200).json({
      success: true,
      reply,
      webSearch: !!webCtx,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
