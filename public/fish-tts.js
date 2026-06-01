// EOS Fish Audio TTS v1.2
// Usa /api/fish-tts proxy (evita CORS) + voz JARVIS MCU oficial
// Voice: JARVIS MCU (Fish Audio) — misma voz que ethanplusai/jarvis
// Setup: localStorage.setItem('eos_fish_key', 'TU_KEY')
//        eos_fish_voice_id opcional — default = JARVIS MCU

(function() {
  'use strict';

  const ELEVEN_HOST = 'api.elevenlabs.io';
  const JARVIS_VOICE = '612b878b113047d9a770c069c8b4fdfe';
  const PROXY_URL = '/api/fish-tts';

  function getFishKey() { return localStorage.getItem('eos_fish_key'); }
  function getFishVoiceId() { return localStorage.getItem('eos_fish_voice_id') || JARVIS_VOICE; }

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

    if (!url.includes(ELEVEN_HOST) || !url.includes('text-to-speech')) {
      return _originalFetch(input, init);
    }

    const fishKey = getFishKey();
    if (!fishKey) {
      return _originalFetch(input, init);
    }

    let text = '';
    try {
      const bodyStr = init && init.body;
      if (typeof bodyStr === 'string') {
        text = (JSON.parse(bodyStr).text || '').trim();
      }
    } catch(e) { text = ''; }

    if (text.length < 3) {
      return _originalFetch(input, init);
    }

    console.log('[Fish TTS v1.2] JARVIS voice | chars:', text.length);

    try {
      const fishRes = await _originalFetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fish-key': fishKey
        },
        body: JSON.stringify({
          text: text,
          reference_id: getFishVoiceId(),
          format: 'mp3',
          latency: 'balanced'
        })
      });

      if (!fishRes.ok) {
        console.error('[Fish TTS v1.2] Proxy error ' + fishRes.status + ' — ElevenLabs fallback');
        return _originalFetch(input, init);
      }

      console.log('[Fish TTS v1.2] OK — JARVIS voice playing');
      return fishRes;

    } catch(e) {
      console.error('[Fish TTS v1.2] ' + e.message + ' — ElevenLabs fallback');
      return _originalFetch(input, init);
    }
  };

  window.openFishAudioSetup = function() {
    const k = prompt('Fish Audio API Key:');
    if (k) { localStorage.setItem('eos_fish_key', k); alert('Fish Audio activado con voz JARVIS. Recarga.'); }
  };

  function boot() {
    const active = getFishKey();
    console.log('[Fish TTS v1.2] ' + (active ? 'ONLINE — JARVIS MCU voice (' + JARVIS_VOICE + ')' : 'Standby — set eos_fish_key'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();