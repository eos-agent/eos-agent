// EOS Intelligence Core V2.0
// N202: Opportunity Scoring + Goal Alignment + Proactive Engine + Pattern Detection

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});

  const { supabaseUrl, supabaseKey, claudeKey } = req.body || {};
  const SB_URL = supabaseUrl || process.env.SUPABASE_URL;
  const SB_KEY = supabaseKey || process.env.SUPABASE_KEY;
  const CL_KEY = claudeKey || process.env.CLAUDE_KEY;

  if (!SB_URL || !SB_KEY || !CL_KEY) {
    return res.status(400).json({error:'Missing keys'});
  }

  const sbH = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };

  try {
    // ── 1. LOAD ALL CONTEXT ────────────────────────────────────────
    const [identity, goals, tasks, opportunities, decisions, contacts, events, lastIntel] = await Promise.all([
      fetch(SB_URL+'/rest/v1/eos_identity?limit=1', {headers:sbH}).then(r=>r.json()).catch(()=>[]),
      fetch(SB_URL+'/rest/v1/goals?status=eq.active&order=created_at.desc', {headers:sbH}).then(r=>r.json()).catch(()=>[]),
      fetch(SB_URL+'/rest/v1/tasks?order=due_date.asc&limit=20', {headers:sbH}).then(r=>r.json()).catch(()=>[]),
      fetch(SB_URL+'/rest/v1/opportunities?order=created_at.desc&limit=30', {headers:sbH}).then(r=>r.json()).catch(()=>[]),
      fetch(SB_URL+'/rest/v1/decisions?order=created_at.desc&limit=20', {headers:sbH}).then(r=>r.json()).catch(()=>[]),
      fetch(SB_URL+'/rest/v1/contacts?order=created_at.desc&limit=15', {headers:sbH}).then(r=>r.json()).catch(()=>[]),
      fetch(SB_URL+'/rest/v1/events?order=created_at.desc&limit=10', {headers:sbH}).then(r=>r.json()).catch(()=>[]),
      fetch(SB_URL+'/rest/v1/intelligence_outputs?order=created_at.desc&limit=3', {headers:sbH}).then(r=>r.json()).catch(()=>[])
    ]);

    const id = identity[0] || {};
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // ── 2. OPPORTUNITY SCORING ENGINE ─────────────────────────────
    function scoreOpportunity(opp, goals) {
      let score = 0;
      const title = (opp.title || opp.name || opp.opportunity || '').toLowerCase();
      const desc = (opp.description || opp.notes || '').toLowerCase();
      const fullText = title + ' ' + desc;

      // Goal alignment (0-30 points)
      goals.forEach(g => {
        const goalText = (g.title || g.goal || '').toLowerCase();
        const goalWords = goalText.split(' ').filter(w => w.length > 3);
        goalWords.forEach(w => { if (fullText.includes(w)) score += 5; });
      });
      score = Math.min(score, 30);

      // Priority field (0-20 points)
      if (opp.priority === 'high' || opp.priority === 'alta') score += 20;
      else if (opp.priority === 'medium' || opp.priority === 'media') score += 10;
      else score += 5;

      // Deadline urgency (0-25 points)
      if (opp.deadline) {
        const deadline = new Date(opp.deadline);
        const daysLeft = Math.floor((deadline - today) / (1000*60*60*24));
        if (daysLeft < 0) score += 5; // expired but still relevant
        else if (daysLeft <= 7) score += 25;
        else if (daysLeft <= 14) score += 18;
        else if (daysLeft <= 30) score += 12;
        else score += 5;
      } else score += 8;

      // Keyword relevance (0-15 points)
      const highValueKeywords = ['festival','showcase','colaboracion','collab','spotify','playlist','sello','label','grant','beca','residencia'];
      highValueKeywords.forEach(k => { if (fullText.includes(k)) score += 5; });
      score = Math.min(score + (score > 30 ? 0 : 10), score);

      // Recency bonus (0-10 points)
      if (opp.created_at) {
        const created = new Date(opp.created_at);
        const daysOld = Math.floor((today - created) / (1000*60*60*24));
        if (daysOld <= 7) score += 10;
        else if (daysOld <= 14) score += 6;
        else if (daysOld <= 30) score += 3;
      }

      return Math.min(100, Math.max(0, score));
    }

    const scoredOpportunities = opportunities.map(opp => ({
      ...opp,
      score: scoreOpportunity(opp, goals)
    })).sort((a, b) => b.score - a.score);

    const topOpportunities = scoredOpportunities.slice(0, 5);

    // ── 3. GOAL ALIGNMENT ANALYSIS ────────────────────────────────
    function analyzeGoalAlignment(goals, tasks, opportunities) {
      const alignment = goals.map(g => {
        const goalText = (g.title || g.goal || '').toLowerCase();
        const relatedTasks = tasks.filter(t => {
          const tText = (t.title || t.description || '').toLowerCase();
          return goalText.split(' ').some(w => w.length > 3 && tText.includes(w));
        });
        const relatedOpps = scoredOpportunities.filter(o => o.score > 40);
        return {
          goal: g.title || g.goal,
          deadline: g.deadline,
          activeTasks: relatedTasks.length,
          hasOpportunities: relatedOpps.length > 0
        };
      });
      return alignment;
    }

    const goalAlignment = analyzeGoalAlignment(goals, tasks, opportunities);

    // ── 4. PROACTIVE INSIGHTS ──────────────────────────────────────
    const insights = [];

    // Overdue tasks
    const overdueTasks = tasks.filter(t => {
      if (!t.due_date || t.status === 'completed') return false;
      return new Date(t.due_date) < today;
    });
    if (overdueTasks.length > 0) {
      insights.push({
        type: 'ALERTA',
        priority: 'high',
        message: overdueTasks.length + ' tarea(s) vencida(s): ' + overdueTasks.slice(0,2).map(t => t.title || t.description || '').join(', ')
      });
    }

    // Tasks due this week
    const thisWeekTasks = tasks.filter(t => {
      if (!t.due_date || t.status === 'completed') return false;
      const due = new Date(t.due_date);
      const daysLeft = Math.floor((due - today) / (1000*60*60*24));
      return daysLeft >= 0 && daysLeft <= 7;
    });
    if (thisWeekTasks.length > 0) {
      insights.push({
        type: 'URGENTE',
        priority: 'high',
        message: thisWeekTasks.length + ' tarea(s) esta semana: ' + thisWeekTasks.slice(0,2).map(t => t.title || '').join(', ')
      });
    }

    // High score opportunities
    if (topOpportunities.length > 0 && topOpportunities[0].score >= 60) {
      insights.push({
        type: 'OPORTUNIDAD',
        priority: 'high',
        message: 'Oportunidad prioritaria detectada: ' + (topOpportunities[0].title || topOpportunities[0].name || '') + ' (score: ' + topOpportunities[0].score + '/100)'
      });
    }

    // Goals without active tasks
    goals.forEach(g => {
      const align = goalAlignment.find(a => a.goal === (g.title || g.goal));
      if (align && align.activeTasks === 0) {
        insights.push({
          type: 'RIESGO',
          priority: 'medium',
          message: 'Goal sin tareas activas: ' + (g.title || g.goal)
        });
      }
    });

    // Contacts not engaged recently
    if (contacts.length > 0) {
      insights.push({
        type: 'NETWORKING',
        priority: 'low',
        message: contacts.length + ' contactos en sistema. Considera hacer seguimiento esta semana.'
      });
    }

    // ── 5. PATTERN DETECTION ──────────────────────────────────────
    const patterns = [];

    // Decision patterns
    if (decisions.length >= 3) {
      const categories = decisions.reduce((acc, d) => {
        const cat = d.category || 'general';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});
      const topCategory = Object.entries(categories).sort((a,b) => b[1]-a[1])[0];
      if (topCategory) {
        patterns.push('Categoria de decision mas frecuente: ' + topCategory[0] + ' (' + topCategory[1] + ' veces)');
      }
    }

    // Opportunity type patterns
    if (opportunities.length >= 5) {
      const highScoreTypes = topOpportunities.map(o => (o.title || '').split(' ')[0]).filter(Boolean);
      if (highScoreTypes.length > 0) {
        patterns.push('Tipos de oportunidad con mayor potencial: ' + [...new Set(highScoreTypes)].slice(0,3).join(', '));
      }
    }

    // ── 6. GENERATE INTELLIGENCE BRIEF ────────────────────────────
    const contextForClaude = `Eres el Intelligence Core V2 de EOS Agent — sistema operativo artistico personal.

IDENTIDAD DEL USUARIO:
${JSON.stringify(id).substring(0, 300)}

GOALS ACTIVOS (${goals.length}):
${goals.map(g => '- ' + (g.title||g.goal||'') + (g.deadline?' [deadline:'+g.deadline+']':'')).join('\n')}

TOP OPORTUNIDADES SCORED:
${topOpportunities.slice(0,3).map(o => '- ['+o.score+'/100] ' + (o.title||o.name||o.opportunity||'').substring(0,80)).join('\n')}

TAREAS ACTIVAS (${tasks.filter(t=>t.status!=='completed').length} pendientes):
${tasks.filter(t=>t.status!=='completed').slice(0,5).map(t => '- ' + (t.title||t.description||'').substring(0,60) + (t.due_date?' ['+t.due_date+']':'')).join('\n')}

INSIGHTS PROACTIVOS:
${insights.map(i => '['+i.type+'] ' + i.message).join('\n')}

PATRONES DETECTADOS:
${patterns.join('\n') || 'Insuficientes datos para patrones'}

ALINEACION CON GOALS:
${goalAlignment.map(a => '- '+a.goal+': '+a.activeTasks+' tareas activas').join('\n')}

Genera un INTELLIGENCE BRIEF ejecutivo con:
1. PRIORIDAD #1 DE LA SEMANA (la accion mas importante alineada con goals)
2. TOP 3 OPORTUNIDADES (con razon especifica de por que cada una importa)
3. ALERTAS (riesgos o urgencias detectadas)
4. RECOMENDACION ESTRATEGICA (una sola, concreta, accionable)
5. PATRON DETECTADO (si existe)

Formato: texto directo, sin markdown excesivo, maximo 400 palabras. Como un Chief of Staff que conoce perfectamente el contexto.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CL_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: contextForClaude }]
      })
    });

    const claudeData = await claudeRes.json();
    const brief = claudeData.content?.[0]?.text || 'Brief no generado';

    // ── 7. SAVE TO SUPABASE ───────────────────────────────────────
    const output = {
      run_at: new Date().toISOString(),
      brief,
      top_opportunities: topOpportunities.slice(0,3).map(o => ({
        title: o.title || o.name || o.opportunity || '',
        score: o.score,
        priority: o.priority
      })),
      insights,
      patterns,
      goal_alignment: goalAlignment,
      overdue_count: overdueTasks.length,
      this_week_tasks: thisWeekTasks.length
    };

    await fetch(SB_URL+'/rest/v1/intelligence_outputs', {
      method: 'POST',
      headers: { ...sbH, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ brief, run_at: output.run_at, context: JSON.stringify(output) })
    });

    return res.status(200).json({
      success: true,
      brief,
      topOpportunities: output.top_opportunities,
      insights,
      patterns,
      goalAlignment,
      overdueTasks: overdueTasks.length,
      thisWeekTasks: thisWeekTasks.length
    });

  } catch(e) {
    console.error('[Intelligence V2]', e.message);
    return res.status(500).json({error: e.message});
  }
}