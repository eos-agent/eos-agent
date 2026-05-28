// ═══════════════════════════════════════════════════════
//  EOS AGENT — Shared utilities for serverless API routes
// ═══════════════════════════════════════════════════════

const CLAUDE_KEY  = process.env.CLAUDE_API_KEY;
const TAVILY_KEY  = process.env.TAVILY_API_KEY;
const TG_TOKEN    = process.env.TELEGRAM_TOKEN;
const TG_CHAT     = process.env.TELEGRAM_CHAT_ID;
const SECRET      = process.env.EOS_WEBHOOK_SECRET;

// EOS system context for Claude
const EOS_SYSTEM = `Eres EOS Agent — la inteligencia estratégica del proyecto musical y documental EOS (Νέα Αρχή), basado en Bogotá, Colombia.

EOS es un proyecto de música cinematic/documental con:
- Identidad visual: rojo/negro, futurista, minimalista
- Inspiración: mitología griega, storytelling emocional auténtico
- Los 5 Orkis (pilares emocionales):
  I.   Amor sin fronteras (amor no correspondido)
  II.  Culpa por no reciprocidad
  III. Cambio — transformación desde el dolor
  IV.  Paz — rendición consciente
  V.   Comienzo — Νέα Αρχή, nuevo inicio

TU ROL: estratega artístico, radar de oportunidades, director creativo IA.
Piensas como productor musical + director de cine + estratega cultural LATAM.
Hablas en español. Tono cinematográfico, directo y preciso.
Ecosistema: indie alternativo LATAM, mercado global emergente.`;

// ── Tavily web search ──────────────────────────────────
async function searchWeb(query, options = {}, tavilyKeyOverride = null) {
  const key = tavilyKeyOverride || TAVILY_KEY;
  if (!key) return null;
  const { maxResults = 5, searchDepth = 'basic', includeAnswer = true, topic = 'general' } = options;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: searchDepth,
      include_answer: includeAnswer,
      include_raw_content: false,
      max_results: maxResults,
      topic
    })
  });
  if (!res.ok) return null;
  return await res.json();
}

// ── Format Tavily results for Claude ──────────────────
function formatSearch(data, query) {
  if (!data) return '';
  let ctx = `\n[BÚSQUEDA: "${query}"]\n`;
  if (data.answer) ctx += `Síntesis: ${data.answer}\n`;
  (data.results || []).slice(0, 4).forEach((r, i) => {
    ctx += `${i + 1}. ${r.title}\n   ${(r.content || '').slice(0, 220)}\n`;
  });
  return ctx;
}

// ── Call Claude ─────────────────────────────────────────
async function callClaude(prompt, systemExtra = '', maxTokens = 800, claudeKeyOverride = null) {
  const key = claudeKeyOverride || CLAUDE_KEY;
  if (!key) throw new Error('CLAUDE_API_KEY not configured');
  const system = EOS_SYSTEM + (systemExtra ? '\n\n' + systemExtra : '');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `Claude error ${res.status}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// ── Send Telegram message ───────────────────────────────
async function sendTelegram(text, chatId = TG_CHAT, token = TG_TOKEN) {
  if (!token || !chatId) return false;
  // Telegram has 4096 char limit — chunk if needed
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' })
    });
  }
  return true;
}

// ── CORS preflight handler ──────────────────────────────
function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

// ── Auth check ──────────────────────────────────────────
function checkAuth(req) {
  if (!SECRET) return true; // no secret configured = open (set one in Vercel env vars)
  const auth = req.headers.authorization || req.headers['x-webhook-secret'] || req.body?.secret || req.query?.secret;
  return auth === SECRET || auth === `Bearer ${SECRET}`;
}

module.exports = { searchWeb, formatSearch, callClaude, sendTelegram, handleCors, checkAuth, EOS_SYSTEM };
