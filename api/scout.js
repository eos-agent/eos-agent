// ─────────────────────────────────────────────────────────
//  EOS AGENT — /api/scout  v2.4
//  Scout Agent: busca oportunidades reales en internet.
//  v2.4: guarda oportunidades en Supabase Memory Core.
// ─────────────────────────────────────────────────────────
import { callClaude, searchWeb, sendTelegram, handleCors } from './_utils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function saveOpportunityToSupabase(opp) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/opportunities`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        title: opp.title || opp.name || 'Sin título',
        description: opp.description || opp.why || '',
        source: opp.source || opp.url || 'Scout Agent',
        priority: opp.priority || 'medium',
        status: 'detected',
        detected_at: new Date().toISOString(),
        metadata: { raw: opp }
      })
    });
    return r.ok;
  } catch(e) { return false; }
}

async function logToSupabase(content, metadata) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
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
        agent: 'scout',
        event_type: 'scan_complete',
        content: content,
        metadata: metadata,
        created_at: new Date().toISOString()
      })
    });
  } catch(e) {}
}

export default async function handler(req, res) {
  handleCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const claudeKey = req.headers['x-claude-key'] || req.body?.claudeKey;
  const tavilyKey = req.headers['x-tavily-key'] || req.body?.tavilyKey;
  const telegramToken = req.headers['x-telegram-token'] || req.body?.telegramToken;
  const telegramChatId = req.headers['x-telegram-chat'] || req.body?.telegramChatId;

  if (!claudeKey) return res.status(400).json({ error: 'Missing claude key' });

  try {
    // 1. Búsqueda web con Tavily
    let webResults = '';
    let tavilyUsed = false;
    if (tavilyKey) {
      const searches = [
        'music festival open call Bogota Colombia 2025 2026',
        'alternative music showcase LATAM emerging artists 2025',
        'music blog submission independent artists cinematic',
        'Spotify playlist curator indie alternative submission'
      ];
      const allResults = await Promise.allSettled(
        searches.map(q => searchWeb(q, tavilyKey))
      );
      const good = allResults.filter(r=>r.status==='fulfilled').map(r=>r.value);
      if (good.length > 0) {
        webResults = good.slice(0,3).map(r => JSON.stringify(r).slice(0,800)).join('\n\n');
        tavilyUsed = true;
      }
    }

    // 2. Claude analiza y estructura oportunidades
    const systemPrompt = `Eres el Scout Agent de EOS — sistema de inteligencia artística para KDK, artista alternativo/cinematográfico en Bogotá, Colombia.
Tu misión: detectar oportunidades reales y estratégicas para el proyecto EOS / Νέα Αρchή.
EOS es: documental artístico real, estética rojo/negro, cinematic, música alternativa, crecimiento orgánico.
Responde SOLO con JSON válido, sin markdown, sin explicaciones fuera del JSON.`;

    const userPrompt = `Analiza estos resultados de búsqueda y extrae las 3 mejores oportunidades para EOS:

RESULTADOS:
${webResults || 'Sin resultados de búsqueda — genera oportunidades basadas en conocimiento del ecosistema musical LATAM 2025.'}

Responde con este JSON exacto:
{
  "critical": "Una sola acción que EOS debe tomar ESTA SEMANA. Máximo 2 oraciones.",
  "opportunities": [
    {
      "title": "Nombre de la oportunidad",
      "why": "Por qué es relevante para EOS (1 oración)",
      "action": "Qué hacer exactamente (1 oración)",
      "priority": "high|medium|low",
      "source": "URL o fuente si existe"
    }
  ],
  "strategy": "Observación estratégica sobre el ecosistema artístico actual (2-3 oraciones)",
  "radar": "Tendencia cultural o artística que EOS debe monitorear (1 oración)"
}`;

    const raw = await callClaude(claudeKey, systemPrompt, userPrompt, 2000);

    // 3. Parse robusto JSON
    let parsed;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found');
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch(e) {
      parsed = {
        critical: 'Revisar manualmente — error de parse en respuesta Claude.',
        opportunities: [],
        strategy: raw.slice(0, 300),
        radar: ''
      };
    }

    // 4. Guardar en Supabase Memory Core
    const opps = parsed.opportunities || [];
    if (opps.length > 0) {
      await Promise.allSettled(opps.map(o => saveOpportunityToSupabase(o)));
    }
    await logToSupabase(parsed.critical || 'Scout scan complete', {
      opps_found: opps.length,
      tavilyUsed,
      strategy: parsed.strategy
    });

    // 5. Telegram para oportunidad crítica
    if (telegramToken && telegramChatId && parsed.critical) {
      const msg = `🔴 EOS SCOUT AGENT\n\n⚡ CRÍTICO: ${parsed.critical}\n\n🎯 ${opps.length} oportunidades detectadas y guardadas en memoria.`;
      await sendTelegram(msg, telegramToken, telegramChatId);
    }

    return res.status(200).json({
      success: true,
      critical: parsed.critical,
      opportunities: opps,
      strategy: parsed.strategy,
      radar: parsed.radar,
      opps: opps.length,
      tavilyUsed,
      savedToMemory: !!SUPABASE_URL,
      timestamp: new Date().toISOString()
    });

  } catch(err) {
    console.error('Scout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
