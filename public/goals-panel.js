// EOS Goals Panel v1.0 — loaded dynamically
(function() {
  if (document.getElementById('eos-goals-panel')) return;

  // Inject HTML
  var html = '<div id="eos-goals-panel" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9200;width:540px;max-height:80vh;overflow-y:auto;background:rgba(5,5,10,0.98);border:1px solid rgba(220,38,38,0.4);border-radius:20px;padding:28px;backdrop-filter:blur(30px);box-shadow:0 0 80px rgba(220,38,38,0.15);font-family:Inter,sans-serif;color:#fff;flex-direction:column;gap:18px;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;"><div style="display:flex;align-items:center;gap:12px;"><div style="width:10px;height:10px;background:#dc2626;border-radius:50%;box-shadow:0 0 12px #dc2626;animation:pulse 2s infinite;"></div><div><div style="font-size:11px;letter-spacing:3px;color:#dc2626;font-weight:700;">SISTEMA DE OBJETIVOS</div><div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:2px;">EOS Nea Arxi - Metas artisticas</div></div></div><button onclick="closeGoals()" style="background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:20px;">x</button></div>'
    + '<div id="goals-list" style="display:flex;flex-direction:column;gap:10px;"><div style="text-align:center;color:rgba(255,255,255,0.3);padding:20px;font-size:12px;">Cargando objetivos...</div></div>'
    + '<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;"><div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.3);margin-bottom:12px;">+ NUEVO OBJETIVO</div>'
    + '<input id="goal-title-input" type="text" placeholder="Nuevo objetivo..." style="width:100%;box-sizing:border-box;padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:12px;outline:none;margin-bottom:8px;font-family:Inter,sans-serif;"/>'
    + '<textarea id="goal-desc-input" placeholder="Descripcion..." style="width:100%;box-sizing:border-box;padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:11px;outline:none;resize:none;height:60px;margin-bottom:8px;font-family:Inter,sans-serif;"></textarea>'
    + '<div style="display:flex;gap:8px;"><select id="goal-priority-input" style="flex:1;padding:9px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:11px;outline:none;"><option value="critical">Critico</option><option value="high" selected>Alto</option><option value="medium">Medio</option><option value="low">Bajo</option></select>'
    + '<input id="goal-date-input" type="date" style="flex:1;padding:9px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:rgba(255,255,255,0.6);font-size:11px;outline:none;"/>'
    + '<button onclick="createGoal()" style="padding:9px 18px;background:rgba(220,38,38,0.2);border:1px solid rgba(220,38,38,0.5);border-radius:8px;color:#dc2626;font-size:11px;font-weight:700;cursor:pointer;">CREAR</button></div></div>'
    + '<div id="goals-status" style="font-size:11px;color:rgba(255,255,255,0.4);text-align:center;min-height:14px;"></div>'
    + '</div>';

  var btn = '<button id="eos-goals-btn" onclick="toggleGoals()" style="position:fixed;bottom:20px;left:74px;z-index:9099;padding:10px 18px;background:rgba(5,5,10,0.97);border:1px solid rgba(220,38,38,0.5);border-radius:50px;color:#dc2626;font-size:11px;letter-spacing:2px;font-weight:700;cursor:pointer;text-transform:uppercase;box-shadow:0 0 20px rgba(220,38,38,0.2);backdrop-filter:blur(10px);display:flex;align-items:center;gap:8px;">🎯 GOALS</button>';

  document.body.insertAdjacentHTML('beforeend', html + btn);

  var _pm = {critical:{label:'CRITICO',color:'#dc2626',bg:'rgba(220,38,38,0.1)',border:'rgba(220,38,38,0.3)'},high:{label:'ALTO',color:'#f59e0b',bg:'rgba(245,158,11,0.08)',border:'rgba(245,158,11,0.25)'},medium:{label:'MEDIO',color:'#3b82f6',bg:'rgba(59,130,246,0.08)',border:'rgba(59,130,246,0.2)'},low:{label:'BAJO',color:'rgba(255,255,255,0.3)',bg:'rgba(255,255,255,0.03)',border:'rgba(255,255,255,0.08)'}};
  
  window.toggleGoals = function() {
    var p = document.getElementById('eos-goals-panel');
    var open = p.style.display === 'flex';
    p.style.display = open ? 'none' : 'flex';
    if (!open) window.loadGoals();
  };
  
  window.closeGoals = function() {
    document.getElementById('eos-goals-panel').style.display = 'none';
  };
  
  function getSb() {
    return {
      url: localStorage.getItem('eos_supabase_url') || localStorage.getItem('supabase_url'),
      key: localStorage.getItem('eos_supabase_key') || localStorage.getItem('supabase_key')
    };
  }
  
  window.loadGoals = async function() {
    var list = document.getElementById('goals-list'), sb = getSb();
    list.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.3);padding:16px;font-size:12px;">Cargando...</div>';
    try {
      var r = await fetch(sb.url + '/rest/v1/goals?order=priority.desc,created_at.asc', {headers:{'apikey':sb.key,'Authorization':'Bearer '+sb.key}});
      var goals = await r.json();
      if (!goals.length) { list.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.3);padding:20px;">No hay objetivos aun.</div>'; return; }
      list.innerHTML = goals.map(function(g) {
        var pm = _pm[g.priority] || _pm.medium, done = g.status === 'completed';
        return '<div style="padding:14px 16px;border-radius:12px;background:' + pm.bg + ';border:1px solid ' + pm.border + ';' + (done?'opacity:0.5;':'') + 'margin-bottom:6px;">'
          + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">'
          + '<div style="flex:1;"><div style="font-size:9px;letter-spacing:2px;color:' + pm.color + ';font-weight:700;margin-bottom:4px;">' + pm.label + '</div>'
          + '<div style="font-size:13px;font-weight:600;color:' + (done?'rgba(255,255,255,0.4)':'#fff') + ';' + (done?'text-decoration:line-through;':'') + '">' + g.title + '</div>'
          + (g.description ? '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;">' + g.description.substring(0,120) + '</div>' : '')
          + '</div><button onclick="window.toggleGoalStatus('' + g.id + '','' + g.status + '')" style="padding:5px 10px;background:' + (done?'rgba(34,197,94,0.15)':'rgba(255,255,255,0.05)') + ';border:1px solid ' + (done?'rgba(34,197,94,0.3)':'rgba(255,255,255,0.1)') + ';border-radius:8px;color:' + (done?'#22c55e':'rgba(255,255,255,0.4)') + ';cursor:pointer;font-size:11px;">' + (done?'Hecho':'Completar') + '</button>'
          + '</div></div>';
      }).join('');
      var gb = document.getElementById('eos-goals-btn');
      var ac = goals.filter(function(g){return g.status!=='completed';}).length;
      if (gb) gb.innerHTML = '🎯 GOALS' + (ac ? ' <span style="font-size:10px;background:#dc2626;color:#fff;padding:1px 6px;border-radius:10px;">' + ac + '</span>' : '');
    } catch(e) { list.innerHTML = '<div style="color:#dc2626;text-align:center;padding:16px;">Error: ' + e.message + '</div>'; }
  };

  window.toggleGoalStatus = async function(id, cur) {
    var sb = getSb();
    await fetch(sb.url + '/rest/v1/goals?id=eq.' + id, {method:'PATCH',headers:{'Content-Type':'application/json','apikey':sb.key,'Authorization':'Bearer '+sb.key,'Prefer':'return=minimal'},body:JSON.stringify({status:cur==='completed'?'active':'completed'})});
    window.loadGoals();
  };

  window.createGoal = async function() {
    var t = document.getElementById('goal-title-input').value.trim();
    var desc = document.getElementById('goal-desc-input').value.trim();
    var pri = document.getElementById('goal-priority-input').value;
    var date = document.getElementById('goal-date-input').value;
    var st = document.getElementById('goals-status');
    if (!t) { st.textContent = 'Escribe el titulo'; return; }
    var sb = getSb(); st.textContent = 'Guardando...';
    try {
      var p = {title:t,description:desc,priority:pri,status:'active'};
      if (date) p.target_date = date;
      var r = await fetch(sb.url + '/rest/v1/goals', {method:'POST',headers:{'Content-Type':'application/json','apikey':sb.key,'Authorization':'Bearer '+sb.key,'Prefer':'return=minimal'},body:JSON.stringify(p)});
      if (r.ok) { document.getElementById('goal-title-input').value = ''; document.getElementById('goal-desc-input').value = ''; st.innerHTML = '<span style="color:#22c55e;">Objetivo creado</span>'; window.loadGoals(); setTimeout(function(){st.textContent='';},3000); }
      else st.innerHTML = '<span style="color:#dc2626;">Error</span>';
    } catch(e) { st.innerHTML = '<span style="color:#dc2626;">' + e.message + '</span>'; }
  };
})();