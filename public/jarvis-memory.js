// EOS JARVIS Memory System v1.0
// Intercepts Anthropic API calls — injects context + saves conversations
;(function() {
  "use strict";
  const SB = () => localStorage.getItem("eos_supabase_url");
  const KEY = () => localStorage.getItem("eos_supabase_anon");
  const SID = "sess_" + Date.now();
  const OF = window.fetch.bind(window);

  async function sbGet(tbl, qs) {
    try {
      const r = await OF(SB() + "/rest/v1/" + tbl + "?" + (qs||""), {
        headers: { "apikey": KEY(), "Authorization": "Bearer " + KEY() }
      });
      return r.ok ? r.json() : [];
    } catch(e) { return []; }
  }

  async function sbSave(tbl, data) {
    try {
      await OF(SB() + "/rest/v1/" + tbl, {
        method: "POST",
        headers: { "apikey": KEY(), "Authorization": "Bearer " + KEY(),
          "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify(data)
      });
    } catch(e) {}
  }

  async function loadCtx() {
    const [id, goals, decs, convs, tasks] = await Promise.all([
      sbGet("eos_identity", "limit=1"),
      sbGet("goals", "status=eq.active&order=priority.desc&limit=5"),
      sbGet("decisions", "order=created_at.desc&limit=5"),
      sbGet("conversations", "order=created_at.desc&limit=20"),
      sbGet("tasks", "status=eq.pending&order=due_date.asc&limit=5")
    ]);
    return { id: id[0], goals, decs, convs, tasks };
  }

  function buildSysPrompt(ctx) {
    const id = ctx.id || {};
    let p = "Eres EOS — sistema de inteligencia artistica de KDK.\n";
    if (id.mission) p += "Mision: " + id.mission.substring(0,200) + "\n";
    if (id.orkis) p += "Los 5 Orkis: " + JSON.stringify(id.orkis).substring(0,300) + "\n";
    if (ctx.goals && ctx.goals.length) {
      p += "\nGOALS ACTIVOS:\n" + ctx.goals.map(g => "- [" + (g.priority||"").toUpperCase() + "] " + g.title).join("\n");
    }
    if (ctx.decs && ctx.decs.length) {
      p += "\n\nULTIMAS DECISIONES:\n" + ctx.decs.map(d => "- " + (d.title||d.content||"")).join("\n");
    }
    if (ctx.tasks && ctx.tasks.length) {
      p += "\n\nTAREAS URGENTES:\n" + ctx.tasks.map(t => "- " + t.title + " (due: " + (t.due_date||"pronto") + ")").join("\n");
    }
    p += "\n\nEres el companero cognitivo de KDK. Recuerdas las conversaciones previas. Respondes con inteligencia artistica, estrategica y emocional.";
    return p;
  }

  function buildMsgs(orig, convs) {
    if (!convs || !convs.length) return orig;
    const hist = convs.slice().reverse().map(c => ({
      role: c.role === "user" ? "user" : "assistant",
      content: c.content
    }));
    const cur = (orig || []).filter(m => m.role === "user").slice(-1)[0];
    if (!cur) return orig;
    return [...hist, cur];
  }

  async function autoLearn(userMsg, aiMsg) {
    const both = (userMsg + " " + aiMsg).toLowerCase();
    const isDecision = ["decidi","decidimos","vamos a","va a ser","confirmado","el plan es"].some(k => both.includes(k));
    const isIdea = ["idea:","se me ocurre","que tal si","podriamos","concepto:"].some(k => both.includes(k));
    if (isDecision) await sbSave("decisions", {
      title: "Auto: " + userMsg.substring(0,80),
      content: userMsg.substring(0,500),
      rationale: "Auto-detectado por EOS JARVIS",
      created_at: new Date().toISOString()
    });
    if (isIdea) await sbSave("ideas", {
      title: "Auto: " + userMsg.substring(0,80),
      content: userMsg.substring(0,500),
      created_at: new Date().toISOString()
    });
  }

  window._eosFetch = OF;
  window.fetch = async function(url, opts) {
    const u = typeof url === "string" ? url : (url && url.url) || "";
    if (u.includes("api.anthropic.com/v1/messages") && opts && opts.method === "POST") {
      try {
        const body = JSON.parse(opts.body || "{}");
        const ctx = await loadCtx();
        const sysPrompt = buildSysPrompt(ctx);
        const msgs = buildMsgs(body.messages, ctx.convs);
        const userMsg = (body.messages || []).filter(m => m.role === "user").slice(-1)[0];
        const userTxt = typeof userMsg === "string" ? userMsg : (userMsg && userMsg.content) || "";
        if (userTxt) sbSave("conversations", { role: "user", content: userTxt.substring(0,8000), session_id: SID });
        const enhanced = Object.assign({}, body, { system: sysPrompt, messages: msgs });
        const resp = await OF(url, Object.assign({}, opts, { body: JSON.stringify(enhanced) }));
        const resp2 = resp.clone();
        resp2.json().then(d => {
          const aiTxt = d && d.content && d.content[0] && d.content[0].text || "";
          if (aiTxt) {
            sbSave("conversations", { role: "assistant", content: aiTxt.substring(0,8000), session_id: SID });
            autoLearn(userTxt, aiTxt);
          }
        }).catch(function(){});
        return resp;
      } catch(e) {
        console.warn("[EOS JARVIS]", e);
        return OF(url, opts);
      }
    }
    return OF(url, opts);
  };

  console.log("[EOS JARVIS] Memory System v1.0 ACTIVE — session: " + SID);
  setTimeout(function() {
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;bottom:24px;left:24px;background:rgba(180,0,0,0.92);color:#fff;padding:7px 16px;border-radius:4px;font-size:11px;font-family:Arial,sans-serif;z-index:99999;letter-spacing:1.5px;pointer-events:none;";
    el.textContent = "EOS JARVIS MEMORY v1.0 — ONLINE";
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); }, 3500);
  }, 1800);

})();