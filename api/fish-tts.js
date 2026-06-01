// EOS Fish Audio Proxy v1.0
// Vercel serverless proxy — bypasses CORS for Fish Audio API
// Called by fish-tts.js client script

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const fishKey = req.headers['x-fish-key'];
  if (!fishKey) {
    return res.status(401).json({ error: 'Missing x-fish-key header' });
  }

  try {
    const { text, reference_id, format, latency } = req.body;

    if (!text || text.length < 2) {
      return res.status(400).json({ error: 'Text too short' });
    }

    const fishRes = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + fishKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        reference_id: reference_id || '612b878b113047d9a770c069c8b4fdfe',
        format: format || 'mp3',
        latency: latency || 'balanced'
      })
    });

    if (!fishRes.ok) {
      const err = await fishRes.text();
      return res.status(fishRes.status).json({ error: err });
    }

    // Stream audio back
    const audioBuffer = await fishRes.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(Buffer.from(audioBuffer));

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}