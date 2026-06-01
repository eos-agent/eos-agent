// EOS Fish Audio TTS v1.3 — VOZ JARVIS MCU FIJA OFICIAL
// Voz: JARVIS MCU (Fish Audio ID: 612b878b113047d9a770c069c8b4fdfe)
// Esta es la voz oficial de EOS. No se cambia.
// Setup unico necesario: localStorage.setItem('eos_fish_key', 'TU_KEY')

(function() {
  'use strict';

  const ELEVEN_HOST = 'api.elevenlabs.io';
  // VOZ OFICIAL EOS — JARVIS MCU — NO MODIFICAR
  const EOS_OFFICIAL_VOICE = '612b878b113047d9a770c069c8b4fdfe';
  const PROXY_URL = '/api/fish-tts';

  function getFishKey() { return localStorage.getItem('eos_fish_key'); }

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

    if (!url.includes(ELEVEN_HOST) || !url.includes('text-to-speech')) {
      return _originalFetch(input, init);
    }

    const fishKey = getFishKey();
    if (!fishKey) return _originalFetch(input, init);

    let text = '';
    try {
      const bodyStr = init && init.body;
      if (typeof bodyStr === 'string') text = (JSON.parse(bodyStr).text || '').trim();
    } catch(e) {}

    if (text.length < 3) return _originalFetch(input, init);

    console.log('[EOS Voice JARVIS] ' + text.length + ' chars -> Fish Audio');

    try {
      const fishRes = await _originalFetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-fish-key': fishKey },
        body: JSON.stringify({ text, format: 'mp3', latency: 'balanced' })
      });

      if (!fishRes.ok) {
        console.error('[EOS Voice] Fish proxy error ' + fishRes.status + ' — fallback ElevenLabs');
        return _originalFetch(input, init);
      }

      console.log('[EOS Voice JARVIS] OK');
      return fishRes;

    } catch(e) {
      console.error('[EOS Voice] ' + e.message + ' — fallback ElevenLabs');
      return _originalFetch(input, init);
    }
  };

  function boot() {
    const k = getFishKey();
    console.log('[EOS Voice JARVIS] ' + (k ? 'ONLINE — voz JARVIS MCU oficial' : 'Standby — configura eos_fish_key'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();