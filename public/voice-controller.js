// EOS Voice Controller v2.0
(function() {
  'use strict';
  const Q={queue:[],playing:false,current:null};
  window.EOSVoiceController=Q;

  function speak(text){if(!text||typeof text!=='string')return;const c=text.replace(/<[^>]+>/g,' ').replace(/[*#]/g,'').replace(/\n+/g,' ').trim().substring(0,400);if(c.length<3)return;Q.queue.push(c);if(!Q.playing)_playNext();}

  async function _playNext(){if(Q.queue.length===0){Q.playing=false;return;}Q.playing=true;const text=Q.queue.shift();if(Q.current){try{Q.current.pause();Q.current.src='';Q.current=null;}catch(e){}}try{const fk=localStorage.getItem('eos_fish_key');const ek=localStorage.getItem('eos_elevenlabs_key');let blob=null;if(fk&&fk.length>20){try{const r=await fetch('/api/fish-tts',{method:'POST',headers:{'Content-Type':'application/json','x-fish-key':fk},body:JSON.stringify({text,format:'mp3'})});if(r.ok)blob=await r.blob();}catch(e){}}if(!blob&&ek){try{const r=await fetch('https://api.elevenlabs.io/v1/text-to-speech/wgKk07zoxxDRH18KKNOf',{method:'POST',headers:{'xi-api-key':ek,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:'eleven_monolingual_v1',voice_settings:{stability:0.5,similarity_boost:0.75}})});if(r.ok)blob=await r.blob();}catch(e){}}if(blob){const url=URL.createObjectURL(blob);const audio=new Audio(url);Q.current=audio;audio.onended=()=>{URL.revokeObjectURL(url);Q.current=null;setTimeout(_playNext,300);};audio.onerror=()=>{URL.revokeObjectURL(url);Q.current=null;setTimeout(_playNext,300);};await audio.play();}else{Q.playing=false;}}catch(e){Q.playing=false;}}

  ['eosSpeak','jdSpeak','n58Speak','__eosVoiceNext','eosVoice'].forEach(fn=>{if(typeof window[fn]==='function')window[fn]=(t)=>{if(t&&typeof t==='string')speak(t);};});
  window.__eosVoiceQueue=Q.queue;window._eosSpeak=speak;

  const WAKE=/\beos\b|\bhey\s*eos\b|\boye\s*eos\b/i;
  let _wakeActive=false,_wakeTimer=null,_rec=null;

  function isWake(t){return WAKE.test(t)||t.toLowerCase().trim()==='eos';}

  function sendToEOS(text){if(!text||text.trim().length<2)return;console.log('[VC2] ->EOS:',text);const input=document.getElementById('floatChatInput');if(input){input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));}if(typeof window.floatSend==='function')window.floatSend(text);else{const btn=document.getElementById('floatSendBtn');if(btn)setTimeout(()=>btn.click(),100);}setInd('PROC');_wakeActive=false;clearTimeout(_wakeTimer);}

  function activate(){_wakeActive=true;clearTimeout(_wakeTimer);speak('Te escucho.');setInd('ACTIVE');_wakeTimer=setTimeout(()=>{_wakeActive=false;setInd('ON');},15000);}

  function startContinuous(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return;_rec=new SR();_rec.lang='en-US';_rec.continuous=true;_rec.interimResults=false;_rec.maxAlternatives=3;_rec.onstart=()=>setInd('ON');_rec.onresult=(event)=>{for(let i=event.resultIndex;i<event.results.length;i++){if(!event.results[i].isFinal)continue;const alts=Array.from(event.results[i]).map(r=>r.transcript.trim());console.log('[VC2] Heard:',alts);const wakeAlt=alts.find(t=>isWake(t));if(wakeAlt){activate();continue;}if(_wakeActive){sendToEOS(alts[0]);}}};_rec.onerror=(e)=>{console.warn('[VC2] err:',e.error);if(e.error==='not-allowed'){setInd('NOPERM');return;}setTimeout(startContinuous,2000);};_rec.onend=()=>{console.log('[VC2] ended, restarting...');setTimeout(startContinuous,500);};try{_rec.start();}catch(e){setTimeout(startContinuous,1000);}}

  function setInd(state){let el=document.getElementById('vc2-ind');if(!el){el=document.createElement('div');el.id='vc2-ind';el.style.cssText='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;background:#000a1a;border:2px solid #ff4422;border-radius:24px;padding:8px 22px;color:#ff4422;font-family:monospace;font-size:12px;letter-spacing:2px;font-weight:bold;cursor:pointer;transition:all 0.3s;user-select:none';el.title='Clic para activar';el.addEventListener('click',()=>{if(!_wakeActive)activate();else{_wakeActive=false;setInd('ON');}});document.body.appendChild(el);}const m={ON:{c:'#ff4422',t:'◎ DI  E·O·S'},ACTIVE:{c:'#00ff88',t:'◉ HABLA AHORA'},PROC:{c:'#ffaa00',t:'◌ PROCESANDO...'},NOPERM:{c:'#555',t:'SIN MIC'}};const s=m[state]||m.ON;el.style.borderColor=s.c;el.style.color=s.c;el.style.boxShadow=state==='ACTIVE'?'0 0 25px rgba(0,255,136,0.5)':'none';el.textContent=s.t;}

  function boot(){console.log('[EOS VC v2.0] ALWAYS-ON boot');setInd('ON');let started=false;const go=()=>{if(!started){started=true;startContinuous();document.removeEventListener('click',go);}};document.addEventListener('click',go,{once:true});setTimeout(go,3000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();