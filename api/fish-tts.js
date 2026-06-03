export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const fishKey = req.headers['x-fish-key'];
  if (!fishKey) return res.status(400).json({error:'Missing x-fish-key'});

  let body;
  try { body = req.body; } catch(e) { return res.status(400).json({error:'Invalid body'}); }

  const text = body.text || '';
  if (!text || text.trim().length < 1) return res.status(400).json({error:'Empty text'});

  // Voice Manager config from request
  const speed = parseFloat(body.speed || '1.0');
  const stability = parseFloat(body.stability || '0.7');
  const expressivity = parseFloat(body.expressivity || '0.8');

  const OFFICIAL_VOICE = '612b878b113047d9a770c069c8b4fdfe'; // JARVIS MCU — NUNCA CAMBIAR

  try {
    const fishRes = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + fishKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text.trim(),
        reference_id: OFFICIAL_VOICE,
        format: body.format || 'mp3',
        mp3_bitrate: 192,
        // Natural voice settings — mas expresivo, menos robotico
        latency: 'normal',       // 'normal' suena mas natural que 'balanced'
        prosody: {
          speed: speed,           // 1.0 = normal, 0.9 = ligeramente mas pausado (mas JARVIS)
          volume: 0,
          normalize_loudness: true
        },
        // No usar chunk_length pequeno — afecta la prosodia
        streaming: false
      })
    });

    if (!fishRes.ok) {
      const errText = await fishRes.text();
      console.error('[fish-tts v2.0] Error', fishRes.status, errText);
      return res.status(fishRes.status).json({error: errText});
    }

    const audioBuffer = await fishRes.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(Buffer.from(audioBuffer));

  } catch(e) {
    console.error('[fish-tts v2.0] Network error:', e.message);
    res.status(500).json({error: e.message});
  }
}