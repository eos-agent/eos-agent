// EOS Fish Audio TTS v1.3 — OFFICIAL
// Voz JARVIS MCU hardcodeada. No requiere eos_fish_voice_id.
// Solo necesita: localStorage.setItem('eos_fish_key', 'TU_KEY')
// Proxy: /api/fish-tts (evita CORS de Fish Audio)

(function() {
  'use strict';

  const EOS_OFFICIAL_VOICE = '612b878b113047d9a770c069c8b4fdfe'; // JARVIS MCU — NUNCA CAMBIAR
  const PROXY_URL = '/api/fish-tts';
  const ELEVEN_HOST = 'api.elevenlabs.io';

  function getFishKey() {
    return localStorage.getItem('eos_fish_key');
  }

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

    if (!url.includes(ELEVEN_HOST) || !url.includes('text-to-speech')) {
      return _originalFetch(input, init);
    }

    const fishKey = getFishKey();

    if (!fishKey || fishKey.length < 20) {
      console.log('[Fish TTS v1.3] No eos_fish_key — usando ElevenLabs');
      return _originalFetch(input, init);
    }

    let text = '';
    try {
      const body = init && init.body ? JSON.parse(init.body) : {};
      text = body.text || '';
    } catch(e) { text = ''; }

    if (!text || text.length < 3) {
      return _originalFetch(input, init);
    }

    console.log('[Fish TTS v1.3] Redirigiendo a JARVIS MCU | chars:', text.length);

    try {
      const proxyRes = await _originalFetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fish-key': fishKey
        },
        body: JSON.stringify({ text: text, format: 'mp3' })
      });

      if (!proxyRes.ok) {
        const err = await proxyRes.text();
        console.error('[Fish TTS v1.3] Proxy error', proxyRes.status, err);
        return _originalFetch(input, init);
      }

      console.log('[Fish TTS v1.3] JARVIS MCU audio recibido');
      return proxyRes;

    } catch(e) {
      console.error('[Fish TTS v1.3] Error de red:', e.message);
      return _originalFetch(input, init);
    }
  };

  function boot() {
    const key = getFishKey();
    if (key && key.length >= 20) {
      console.log('[Fish TTS v1.3] ONLINE — JARVIS MCU voice activa');
      showIndicator(true);
    } else {
      console.log('[Fish TTS v1.3] Standby — configura eos_fish_key');
      showIndicator(false);
    }
  }

  function showIndicator(active) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:99999;padding:8px 14px;border-radius:8px;font-family:monospace;font-size:11px;font-weight:bold;letter-spacing:1px;animation:fishPulse 2s infinite';
    if (active) {
      div.style.cssText += ';background:#000a00;border:1px solid #00ff88;color:#00ff88;box-shadow:0 0 15px rgba(0,255,136,0.3)';
      div.textContent = '◈ JARVIS MCU — FISH AUDIO ONLINE';
    } else {
      div.style.cssText += ';background:#0a0000;border:1px solid #ff4444;color:#ff6666;box-shadow:0 0 15px rgba(255,0,0,0.2)';
      div.textContent = '◈ FISH AUDIO — SIN KEY';
    }
    const style = document.createElement('style');
    style.textContent = '@keyframes fishPulse{0%,100%{opacity:0.8}50%{opacity:1}}';
    document.head.appendChild(style);
    document.body.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.EOSFishTTS = { version: '1.3', voice: EOS_OFFICIAL_VOICE };

})();