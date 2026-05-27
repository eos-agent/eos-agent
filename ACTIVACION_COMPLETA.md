# EOS AGENT — GUÍA DE ACTIVACIÓN COMPLETA
## Fase 1 + Fase 2 · Todo lo que necesitas hacer

---

## PASO 1 — CLAUDE API KEY (~5 min)

1. Ve a: https://console.anthropic.com
2. Crea cuenta con tu email
3. Billing → Add payment method (tarjeta)
4. API Keys → Create Key → copia la key (empieza con `sk-ant-...`)
5. En el dashboard EOS → Ajustes (⚙) → ANTHROPIC API KEY → pega → Guardar

**Costo:** ~$10 USD/mes dependiendo del uso

---

## PASO 2 — TAVILY API KEY (~3 min)

1. Ve a: https://app.tavily.com
2. Sign up (gratis, no necesita tarjeta)
3. Copia tu API key (empieza con `tvly-...`)
4. En el dashboard EOS → Ajustes (⚙) → BÚSQUEDA WEB → pega → Guardar

**Costo:** GRATIS (1000 búsquedas/mes)

---

## PASO 3 — TELEGRAM BOT (~5 min)

1. Abre Telegram en tu teléfono
2. Busca: `@BotFather`
3. Escribe: `/newbot`
4. Nombre: `EOS Agent` (o el que quieras)
5. Username: `eos_kdk_bot` (debe terminar en _bot)
6. BotFather te da un TOKEN — guárdalo: `123456:ABC-DEF...`
7. Ahora abre tu bot y escribe `/start`
8. Ve a: https://api.telegram.org/bot{TU_TOKEN}/getUpdates
   → Copia el número en `"id":` (tu Chat ID)

---

## PASO 4 — VARIABLES DE ENTORNO EN VERCEL (~5 min)

1. Ve a: https://vercel.com/eos-agent/eos-agent/settings/environment-variables
2. Agrega estas variables (una por una):

| Variable | Valor |
|---|---|
| `CLAUDE_API_KEY` | sk-ant-... (tu key de Anthropic) |
| `TAVILY_API_KEY` | tvly-... (tu key de Tavily) |
| `TELEGRAM_TOKEN` | 123456:ABC... (token de BotFather) |
| `TELEGRAM_CHAT_ID` | tu número de Chat ID |
| `EOS_WEBHOOK_SECRET` | eos2025jarvis (o cualquier clave secreta) |

3. Cada variable: Name → Value → Add

---

## PASO 5 — N8N CLOUD (~10 min)

1. Ve a: https://app.n8n.cloud
2. Crea cuenta → elige plan Starter ($20/mes)
3. Add payment method
4. Una vez dentro:

### Workflow 1 — Morning Brief (cada mañana)
1. New Workflow → Add node → Schedule Trigger
2. Configure: `0 12 * * *` (7am Bogotá = 12pm UTC)
3. Add node → HTTP Request:
   - Method: POST
   - URL: `https://eos-agent.vercel.app/api/brief`
   - Headers: `Authorization: eos2025jarvis`
4. Save → Toggle ON

### Workflow 2 — Scout Agent (lunes y jueves)
1. New Workflow → Schedule Trigger: `0 19 * * 1,4`
2. HTTP Request → URL: `https://eos-agent.vercel.app/api/scout`
3. Headers: `Authorization: eos2025jarvis`
4. Save → Toggle ON

### Workflow 3 — Trend Analyzer (miércoles y domingo)
1. New Workflow → Schedule Trigger: `0 21 * * 3,0`
2. HTTP Request → URL: `https://eos-agent.vercel.app/api/trends`
3. Headers: `Authorization: eos2025jarvis`
4. Save → Toggle ON

---

## PASO 6 — REDESPLEGAR VERCEL (~2 min)

Después de agregar las variables de entorno:
1. Ve a: https://vercel.com/eos-agent/eos-agent
2. Deployments → tres puntos en el último deployment → Redeploy

O simplemente corre el script de push (yo lo hago):
```
cd ~/Documents/Claude/Projects/EOS/EOS-AGENT-PROJECT
python3 push_to_github.py
```
Vercel redespliega automáticamente.

---

## RESULTADO FINAL

Una vez configurado todo:

✅ **7:00am** — EOS te manda el Morning Brief a Telegram con noticias del día  
✅ **Lunes y Jueves** — Scout Report con oportunidades reales de internet  
✅ **Miércoles y Domingo** — Trend Report con análisis cultural actual  
✅ **Dashboard** — JARVIS Dialog responde con inteligencia real + búsqueda web  
✅ **Voz** — Di "EOS" → escucha → responde con voz ElevenLabs  
✅ **Telegram** — Escríbele a tu bot y EOS responde con Claude + internet  

---

## RESUMEN DE COSTOS (COP/mes)

| Servicio | USD | COP |
|---|---|---|
| Claude API (Anthropic) | ~$10 | ~$42.000 |
| Tavily Search | $0 | $0 |
| n8n Cloud Starter | $20 | ~$84.000 |
| Vercel Hobby | $0 | $0 |
| ElevenLabs | $0 (ya integrado) | $0 |
| **TOTAL** | **~$30** | **~$126.000** |

---

*EOS Agent — Sistema Operativo Artístico Autónomo*  
*Construido con Claude + Tavily + ElevenLabs + n8n*
