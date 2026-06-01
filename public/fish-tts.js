// EOS Fish Audio TTS v1.1 — Fix: header model, min text length, body model field
(function() {
  'use strict';

  const FISH_API = 'https://api.fish.audio/v1/tts';
  const ELEVEN_HOST = 'api.elevenlabs.io';

  function getFishKey() { return localStorage.getItem('eos_fish_key'); }
  function getFishVoiceId() { return localStorage.getItem('eos_fish_voice_id'); }

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

    if (!url.includes(ELEVEN_HOST) || !url.includes('text-to-speech')) {
      return _originalFetch(input, init);
    }

    const fishKey = getFishKey();
    const fishVoiceId = getFishVoiceId();

    if (!fishKey || !fishVoiceId) {
      return _originalFetch(input, init);
    }

    let text = '';
    try {
      const bodyStr = init && init.body;
      if (typeof bodyStr === 'string') {
        text = (JSON.parse(bodyStr).text || '').trim();
      }
    } catch(e) { text = ''; }

    // Skip very short texts (boot sounds, single chars)
    if (text.length < 3) {
      return _originalFetch(input, init);
    }

    console.log('[Fish TTS v1.1] -> Fish Audio S2-Pro | chars:', text.length);

    try {
      const fishRes = await _originalFetch(FISH_API, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + fishKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          reference_id: fishVoiceId,
          format: 'mp3',
          latency: 'balanced'
        })
      });

      if (!fishRes.ok) {
        const errText = await fishRes.clone().text().catch(() => fishRes.status + '');
        console.error('[Fish TTS v1.1] Error ' + fishRes.status + ' — ElevenLabs fallback');
        return _originalFetch(input, init);
      }

      console.log('[Fish TTS v1.1] OK');
      return fishRes;

    } catch(e) {
      console.error('[Fish TTS v1.1] ' + e.message + ' — ElevenLabs fallback');
      return _originalFetch(input, init);
    }
  };

  window.openFishAudioSetup = function() {
    const k = prompt('Fish Audio API Key (eos_fish_key):');
    const v = prompt('Fish Voice Model ID (eos_fish_voice_id):');
    if (k) localStorage.setItem('eos_fish_key', k);
    if (v) localStorage.setItem('eos_fish_voice_id', v);
    if (k || v) alert('Fish Audio configurado. Recarga para activar.');
  };

  function boot() {
    const active = getFishKey() && getFishVoiceId();
    console.log('[Fish TTS v1.1] ' + (active ? 'ONLINE — intercepting ElevenLabs -> Fish Audio S2-Pro' : 'Standby — configura eos_fish_key y eos_fish_voice_id'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();