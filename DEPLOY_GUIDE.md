# EOS Agent — Deployment Guide (Vercel)

## Archivos del proyecto
```
EOS-AGENT-PROJECT/
  index.html      ← app principal (1.4MB)
  manifest.json   ← PWA manifest
  sw.js           ← Service Worker (offline cache)
  vercel.json     ← config deployment
  icon-192.png    ← ícono app (Android/Chrome)
  icon-512.png    ← ícono app (splash screen)
```

---

## Paso 1 — Crear cuenta en Vercel (gratis)
→ https://vercel.com/signup
- Usa "Continue with GitHub" (necesitarás una cuenta GitHub también)

## Paso 2 — Crear repositorio en GitHub
1. Ve a https://github.com/new
2. Nombre: `eos-agent`
3. Private ✓ (nadie puede ver tu código)
4. Create repository

## Paso 3 — Subir archivos
En tu Mac, abre Terminal y escribe:
```bash
cd ~/Documents/Claude/Projects/EOS/EOS-AGENT-PROJECT
git init
git add index.html manifest.json sw.js vercel.json icon-192.png icon-512.png
git commit -m "EOS Agent v1 — PWA Launch"
git remote add origin https://github.com/TU_USUARIO/eos-agent.git
git push -u origin main
```

## Paso 4 — Conectar Vercel
1. Ve a https://vercel.com/new
2. "Import Git Repository" → selecciona `eos-agent`
3. Framework Preset: Other
4. Deploy → espera ~30 segundos

## Resultado
Tu EOS estará vivo en: `https://eos-agent.vercel.app`

---

## Instalar en iPhone
1. Abre Safari → ve a tu URL de Vercel
2. Toca el botón compartir (cuadrado con flecha ↑)
3. "Añadir a pantalla de inicio"
4. Nombre: EOS Agent → Añadir
5. ¡Listo! Aparece como app con ícono rojo

## Instalar en Android
1. Abre Chrome → ve a tu URL de Vercel
2. Toca el menú (3 puntos) → "Instalar app"
3. O espera el banner automático "Añadir a pantalla de inicio"

---

## Notas importantes
- Los datos (localStorage) son por dispositivo — Mac y celular tienen datos separados hasta Fase 3 (Supabase)
- Para actualizar la app: sube nuevos archivos a GitHub → Vercel re-deploya automáticamente
- La URL de Vercel se puede personalizar con un dominio propio si lo tienes
