// EOS Fish Audio TTS v1.0
// Intercepta llamadas a ElevenLabs y las redirige a Fish Audio S2-Pro
// Setup: localStorage.setItem('eos_fish_key', 'YOUR_FISH_API_KEY')
//        localStorage.setItem('eos_fish_voice_id', 'YOUR_FISH_VOICE_MODEL_ID')
// Si no hay eos_fish_key -> fallback automatico a ElevenLabs

(function() {
  'use strict';

  const FISH_API = 'https://api.fish.audio/v1/tts';
  const ELEVEN_HOST = 'api.elevenlabs.io';

  function getFishKey() {
    return localStorage.getItem('eos_fish_key');
  }

  function getFishVoiceId() {
    return localStorage.getItem('eos_fish_voice_id');
  }

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input.url || '');

    if (!url.includes(ELEVEN_HOST) || !url.includes('text-to-speech')) {
      return _originalFetch(input, init);
    }

    const fishKey = getFishKey();
    const fishVoiceId = getFishVoiceId();

    if (!fishKey || !fishVoiceId) {
      console.log('[Fish TTS] No config -> ElevenLabs fallback');
      return _originalFetch(input, init);
    }

    let text = '';
    try {
      const body = init && init.body ? JSON.parse(init.body) : {};
      text = body.text || '';
    } catch(e) { text = ''; }

    if (!text) return _originalFetch(input, init);

    console.log('[Fish TTS] -> Fish Audio S2-Pro | chars:', text.length);

    try {
      const fishRes = await _originalFetch(FISH_API, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + fishKey,
          'Content-Type': 'application/json',
          'model': 's2-pro'
        },
        body: JSON.stringify({
          text: text,
          reference_id: fishVoiceId,
          format: 'mp3',
          mp3_bitrate: 128,
          latency: 'balanced',
          prosody: { speed: 1.0, volume: 0, normalize_loudness: true }
        })
      });

      if (!fishRes.ok) {
        console.error('[Fish TTS] Error', fishRes.status, '-> ElevenLabs fallback');
        return _originalFetch(input, init);
      }

      console.log('[Fish TTS] OK');
      return fishRes;

    } catch(e) {
      console.error('[Fish TTS] Network error:', e.message, '-> ElevenLabs fallback');
      return _originalFetch(input, init);
    }
  };

  function showIndicator() {
    const fishKey = getFishKey();
    const voiceId = getFishVoiceId();
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:99999;background:linear-gradient(135deg,#000a1a,#001a33);border:1px solid ' + (fishKey && voiceId ? '#00ff88' : '#0088ff') + ';border-radius:8px;padding:10px 16px;color:' + (fishKey && voiceId ? '#00ff88' : '#00aaff') + ';font-family:monospace;font-size:12px;letter-spacing:1px;font-weight:bold;box-shadow:0 0 20px rgba(0,136,255,0.4);cursor:pointer';
    div.textContent = fishKey && voiceId ? 'FISH AUDIO S2-PRO ONLINE' : 'FISH AUDIO SETUP REQUIRED';
    if (!fishKey || !voiceId) div.addEventListener('click', () => {
      const k = prompt('Fish Audio API Key (eos_fish_key):');
      const v = prompt('Fish Voice Model ID (eos_fish_voice_id):');
      if (k) localStorage.setItem('eos_fish_key', k);
      if (v) localStorage.setItem('eos_fish_voice_id', v);
      alert('Saved! Reload to activate Fish Audio.');
    });
    document.body.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 4000);
  }

  window.openFishAudioSetup = function() {
    const k = prompt('Fish Audio API Key:');
    const v = prompt('Fish Voice Model ID:');
    if (k) localStorage.setItem('eos_fish_key', k);
    if (v) localStorage.setItem('eos_fish_voice_id', v);
    alert('Fish Audio configured. Reload to activate.');
  };

  function boot() {
    console.log('[Fish TTS v1.0] ' + (getFishKey() ? 'ONLINE' : 'Standby — set eos_fish_key + eos_fish_voice_id'));
    showIndicator();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();