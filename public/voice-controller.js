// EOS Voice Controller v1.2
// Fix: wake word detection flexible + idioma en-US para mejor reconocimiento de EOS
(function() {
  'use strict';
  const VC = { queue:[], playing:false, currentAudio:null, listening:false, recognition:null, muted:false, enabled:true };
  window.EOSVoiceController = VC;
  let _wakeActive = false, _wakeTimer = null;

  // Variantes de como el STT puede transcribir "EOS"
  const WAKE_PATTERNS = [/\beos\b/i, /\bhey\s*eos\b/i, /\boyep?\b/i, /\be\.?o\.?s\b/i, /\bios\b/i, /^eo$/, /\beos,/i, /\bhe eos\b/i];

  function isWakeWord(text) {
    const lower = text.toLowerCase().trim();
    // Exact or partial matches
    if (lower === 'eos' || lower === 'hey eos' || lower === 'oye eos' || lower === 'hola eos') return true;
    if (lower.startsWith('eos ') || lower.endsWith(' eos') || lower.includes(' eos ')) return true;
    return WAKE_PATTERNS.some(p => p.test(lower));
  }

  function speak(text) {
    if(!text||typeof text!=='string'||VC.muted) return;
    const clean=text.replace(/<[^>]+>/g,' ').replace(/[*#]/g,'').replace(/\n+/g,'. ').trim().substring(0,500);
    if(clean.length<3) return;
    VC.queue.push(clean);
    if(!VC.playing) processQueue();
  }

  async function processQueue() {
    if(VC.queue.length===0){VC.playing=false;if(!VC.listening)startListening();return;}
    VC.playing=true;const text=VC.queue.shift();stopCurrentAudio();pauseListening();
    try {
      const fishKey=localStorage.getItem('eos_fish_key');const elevenKey=localStorage.getItem('eos_elevenlabs_key');let blob=null;
      if(fishKey&&fishKey.length>20){try{const r=await fetch('/api/fish-tts',{method:'POST',headers:{'Content-Type':'application/json','x-fish-key':fishKey},body:JSON.stringify({text,format:'mp3'})});if(r.ok)blob=await r.blob();}catch(e){}}
      if(!blob&&elevenKey){try{const r=await fetch('https://api.elevenlabs.io/v1/text-to-speech/wgKk07zoxxDRH18KKNOf',{method:'POST',headers:{'xi-api-key':elevenKey,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:'eleven_monolingual_v1',voice_settings:{stability:0.5,similarity_boost:0.75}})});if(r.ok)blob=await r.blob();}catch(e){}}
      if(blob){const url=URL.createObjectURL(blob);const audio=new Audio(url);VC.currentAudio=audio;audio.onended=()=>{URL.revokeObjectURL(url);VC.currentAudio=null;setTimeout(processQueue,500);};audio.onerror=()=>{URL.revokeObjectURL(url);VC.currentAudio=null;setTimeout(processQueue,400);};await audio.play();}
      else{VC.playing=false;startListening();}
    }catch(e){VC.currentAudio=null;VC.playing=false;startListening();}
  }

  function stopCurrentAudio(){if(VC.currentAudio){try{VC.currentAudio.pause();VC.currentAudio.src='';VC.currentAudio=null;}catch(e){}}}

  function handleVoiceInput(text) {
    if(!text||text.trim().length<2) return;
    const lower=text.toLowerCase().trim();
    console.log('[VC] Heard:', lower);
    
    if(isWakeWord(text)){
      _wakeActive=true;clearTimeout(_wakeTimer);
      speak('Te escucho.');updateIndicator('ACTIVO');
      _wakeTimer=setTimeout(()=>{_wakeActive=false;updateIndicator('ESCUCHANDO');},20000);
      return;
    }
    
    if(!_wakeActive) return;
    
    // Reset wake timer
    clearTimeout(_wakeTimer);_wakeTimer=setTimeout(()=>{_wakeActive=false;updateIndicator('ESCUCHANDO');},20000);
    updateIndicator('PROCESANDO');
    
    const input=document.getElementById('floatChatInput');
    if(input){input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));}
    if(typeof window.floatSend==='function'){
      window.floatSend(text);
      setTimeout(()=>updateIndicator('ACTIVO'),2000);
    } else {
      const btn=document.getElementById('floatSendBtn');if(btn)setTimeout(()=>btn.click(),150);
    }
  }

  function initSTT(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return null;
    const rec=new SR();
    // Use en-US for better EOS recognition, with Spanish fallback
    rec.lang='en-US';rec.continuous=false;rec.interimResults=false;rec.maxAlternatives=3;
    rec.onresult=(e)=>{
      // Check all alternatives for wake word
      const alternatives=Array.from(e.results[0]).map(r=>r.transcript.trim());
      console.log('[VC] Alternatives:', alternatives);
      const wakeAlt=alternatives.find(t=>isWakeWord(t));
      const best=wakeAlt||alternatives[0];
      handleVoiceInput(best);
      VC.listening=false;setTimeout(startListening,300);
    };
    rec.onend=()=>{VC.listening=false;if(!VC.playing&&VC.enabled)setTimeout(startListening,400);};
    rec.onerror=(e)=>{
      VC.listening=false;
      console.warn('[VC] STT Error:',e.error);
      if(e.error==='not-allowed'){VC.enabled=false;updateIndicator('SIN_PERMISO');return;}
      if(!VC.playing&&VC.enabled)setTimeout(startListening,1000);
    };
    return rec;
  }

  function startListening(){
    if(VC.listening||VC.playing||!VC.enabled)return;
    if(!VC.recognition)VC.recognition=initSTT();if(!VC.recognition)return;
    try{VC.recognition.start();VC.listening=true;updateIndicator(_wakeActive?'ACTIVO':'ESCUCHANDO');}catch(e){if(!e.message.includes('already started'))console.warn('[VC]',e.message);}
  }

  function pauseListening(){if(!VC.listening||!VC.recognition)return;try{VC.recognition.abort();VC.listening=false;}catch(e){}}

  function overrideExistingSpeakFunctions(){['eosSpeak','jdSpeak','n58Speak','__eosVoiceNext'].forEach(fn=>{if(typeof window[fn]==='function')window[fn]=(t)=>{if(t&&typeof t==='string')speak(t);};});window.__eosVoiceQueue=VC.queue;}

  function updateIndicator(state){
    const el=document.getElementById('vc-mic-indicator');if(!el)return;
    const map={ESCUCHANDO:{c:'#ff4422',t:'◎ DI EOS'},ACTIVO:{c:'#00ff88',t:'◉ HABLA AHORA'},PROCESANDO:{c:'#ffaa00',t:'◌ PROCESANDO...'},SIN_PERMISO:{c:'#666',t:'◎ SIN MICROFONO'}};
    const s=map[state]||map.ESCUCHANDO;el.style.borderColor=s.c;el.style.color=s.c;el.textContent=s.t;
    if(state==='ACTIVO')el.style.boxShadow='0 0 20px rgba(0,255,136,0.5)';else el.style.boxShadow='none';
  }

  function createIndicator(){
    const old=document.getElementById('vc-mic-indicator');if(old)old.remove();
    const div=document.createElement('div');div.id='vc-mic-indicator';
    div.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99998;background:#000a1a;border:2px solid #ff4422;border-radius:24px;padding:8px 20px;color:#ff4422;font-family:monospace;font-size:12px;letter-spacing:2px;font-weight:bold;cursor:pointer;transition:all 0.3s;user-select:none';
    div.textContent='◎ DI EOS';
    div.title='Haz clic para activar o di EOS';
    div.addEventListener('click',()=>{
      if(_wakeActive){_wakeActive=false;clearTimeout(_wakeTimer);updateIndicator('ESCUCHANDO');}
      else{_wakeActive=true;clearTimeout(_wakeTimer);speak('Te escucho.');updateIndicator('ACTIVO');_wakeTimer=setTimeout(()=>{_wakeActive=false;updateIndicator('ESCUCHANDO');},20000);}
    });
    document.body.appendChild(div);
  }

  window.EOSVoice={speak,startListening,mute:()=>{VC.muted=true;},unmute:()=>{VC.muted=false;},activate:()=>{_wakeActive=true;updateIndicator('ACTIVO');speak('Te escucho.');},status:()=>({playing:VC.playing,listening:VC.listening,wakeActive:_wakeActive,queue:VC.queue.length})};

  function boot(){
    console.log('[EOS Voice Controller v1.2] Booting...');
    overrideExistingSpeakFunctions();createIndicator();
    setTimeout(()=>{VC.enabled=true;startListening();console.log('[EOS VC v1.2] Online — di EOS o haz clic en el indicador');},2000);
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot);}else{boot();}
})();