// EOS Voice Controller v1.1
(function() {
  'use strict';
  const VC = { queue: [], playing: false, currentAudio: null, listening: false, recognition: null, muted: false, enabled: true };
  window.EOSVoiceController = VC;
  const WAKE_WORDS = ['eos', 'hey eos', 'oye eos', 'hola eos'];
  let _wakeActive = false, _wakeTimer = null;

  function speak(text) { if (!text||typeof text!=='string'||VC.muted) return; const clean=text.replace(/<[^>]+>/g,' ').replace(/[*#]/g,'').replace(/\n+/g,'. ').trim().substring(0,500); if(clean.length<3) return; VC.queue.push(clean); if(!VC.playing) processQueue(); }

  async function processQueue() {
    if(VC.queue.length===0){VC.playing=false;if(!VC.listening)startListening();return;}
    VC.playing=true; const text=VC.queue.shift(); stopCurrentAudio(); pauseListening();
    try {
      const fishKey=localStorage.getItem('eos_fish_key'); const elevenKey=localStorage.getItem('eos_elevenlabs_key'); let audioBlob=null;
      if(fishKey&&fishKey.length>20){try{const r=await fetch('/api/fish-tts',{method:'POST',headers:{'Content-Type':'application/json','x-fish-key':fishKey},body:JSON.stringify({text,format:'mp3'})});if(r.ok)audioBlob=await r.blob();}catch(e){}}
      if(!audioBlob&&elevenKey){try{const r=await fetch('https://api.elevenlabs.io/v1/text-to-speech/wgKk07zoxxDRH18KKNOf',{method:'POST',headers:{'xi-api-key':elevenKey,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:'eleven_monolingual_v1',voice_settings:{stability:0.5,similarity_boost:0.75}})});if(r.ok)audioBlob=await r.blob();}catch(e){}}
      if(audioBlob){const url=URL.createObjectURL(audioBlob);const audio=new Audio(url);VC.currentAudio=audio;audio.onended=()=>{URL.revokeObjectURL(url);VC.currentAudio=null;setTimeout(processQueue,400);};audio.onerror=()=>{URL.revokeObjectURL(url);VC.currentAudio=null;setTimeout(processQueue,400);};await audio.play();}
      else{VC.playing=false;startListening();}
    } catch(e){VC.currentAudio=null;VC.playing=false;startListening();}
  }

  function stopCurrentAudio(){if(VC.currentAudio){try{VC.currentAudio.pause();VC.currentAudio.src='';VC.currentAudio=null;}catch(e){}}}

  function handleVoiceInput(text) {
    const lower=text.toLowerCase().trim();
    const isWake=WAKE_WORDS.some(w=>lower===w||lower.startsWith(w+' '));
    if(isWake){_wakeActive=true;clearTimeout(_wakeTimer);speak('Te escucho.');updateIndicator('ACTIVO');_wakeTimer=setTimeout(()=>{_wakeActive=false;updateIndicator('ESCUCHANDO');},15000);return;}
    if(!_wakeActive) return;
    clearTimeout(_wakeTimer);_wakeTimer=setTimeout(()=>{_wakeActive=false;updateIndicator('ESCUCHANDO');},15000);
    updateIndicator('PROCESANDO');
    const input=document.getElementById('floatChatInput');if(input){input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));}
    if(typeof window.floatSend==='function'){window.floatSend(text);setTimeout(()=>updateIndicator('ESCUCHANDO'),3000);}
    else{const btn=document.getElementById('floatSendBtn');if(btn)setTimeout(()=>btn.click(),150);}
  }

  function initSTT(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return null;const rec=new SR();rec.lang='es-CO';rec.continuous=false;rec.interimResults=false;rec.onresult=(e)=>{const t=e.results[0][0].transcript.trim();if(t)handleVoiceInput(t);};rec.onend=()=>{VC.listening=false;if(!VC.playing&&VC.enabled)setTimeout(startListening,500);};rec.onerror=(e)=>{VC.listening=false;if(!VC.playing&&VC.enabled)setTimeout(startListening,800);};return rec;}
  function startListening(){if(VC.listening||VC.playing||!VC.enabled)return;if(!VC.recognition)VC.recognition=initSTT();if(!VC.recognition)return;try{VC.recognition.start();VC.listening=true;updateIndicator(_wakeActive?'ACTIVO':'ESCUCHANDO');}catch(e){}}
  function pauseListening(){if(!VC.listening||!VC.recognition)return;try{VC.recognition.abort();VC.listening=false;}catch(e){}}
  function overrideExistingSpeakFunctions(){['eosSpeak','jdSpeak','n58Speak','__eosVoiceNext'].forEach(fn=>{if(typeof window[fn]==='function')window[fn]=(t)=>{if(t&&typeof t==='string')speak(t);};});window.__eosVoiceQueue=VC.queue;}

  function updateIndicator(state){const el=document.getElementById('vc-mic-indicator');if(!el)return;const map={ESCUCHANDO:{c:'#ff4422',t:'ESCUCHANDO'},ACTIVO:{c:'#00ff88',t:'ACTIVO - HABLA'},PROCESANDO:{c:'#ffaa00',t:'PROCESANDO...'}};const s=map[state]||map.ESCUCHANDO;el.style.borderColor=s.c;el.style.color=s.c;el.textContent=s.t;}
  function createIndicator(){if(document.getElementById('vc-mic-indicator'))return;const div=document.createElement('div');div.id='vc-mic-indicator';div.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99998;background:#000a1a;border:1px solid #ff4422;border-radius:20px;padding:7px 18px;color:#ff4422;font-family:monospace;font-size:11px;letter-spacing:2px;font-weight:bold;cursor:pointer;transition:all 0.3s';div.textContent='ESCUCHANDO';div.addEventListener('click',()=>{if(!_wakeActive){_wakeActive=true;updateIndicator('ACTIVO');speak('Te escucho.');_wakeTimer=setTimeout(()=>{_wakeActive=false;updateIndicator('ESCUCHANDO');},15000);}else{_wakeActive=false;clearTimeout(_wakeTimer);updateIndicator('ESCUCHANDO');}});document.body.appendChild(div);}

  window.EOSVoice={speak,startListening,mute:()=>{VC.muted=true;},unmute:()=>{VC.muted=false;},activate:()=>{_wakeActive=true;updateIndicator('ACTIVO');speak('Te escucho.');},status:()=>({playing:VC.playing,listening:VC.listening,wakeActive:_wakeActive,queue:VC.queue.length})};

  function boot(){console.log('[EOS Voice Controller v1.1] Booting...');overrideExistingSpeakFunctions();createIndicator();setTimeout(()=>{VC.enabled=true;startListening();console.log('[EOS Voice Controller v1.1] Online');},2500);}
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot);}else{boot();}
})();