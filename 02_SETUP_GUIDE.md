# EOS AGENT — GUÍA DE SETUP INICIAL
### Todo lo que necesitas instalar (gratis)

---

## CUENTAS A CREAR (todas gratuitas)

### 1. GitHub
- URL: https://github.com
- Para qué: guardar y versionar el código del proyecto
- Plan: Free (ilimitado para proyectos personales)

### 2. Vercel
- URL: https://vercel.com
- Para qué: hosting del dashboard (deploy automático desde GitHub)
- Plan: Hobby (gratuito, suficiente para MVP)

### 3. Supabase
- URL: https://supabase.com
- Para qué: base de datos + memoria del sistema
- Plan: Free (500MB, más que suficiente para empezar)

### 4. n8n (cuando se necesite)
- URL: https://n8n.io
- Para qué: automatizaciones
- Plan: Free cloud o self-hosted

---

## SOFTWARE A INSTALAR EN TU COMPUTADOR

### Node.js
- URL: https://nodejs.org
- Versión: LTS (la más estable)
- Para qué: correr el proyecto localmente

### Git
- URL: https://git-scm.com
- Para qué: control de versiones

### VS Code (editor de código)
- URL: https://code.visualstudio.com
- Para qué: editar archivos del proyecto
- Extensions recomendadas:
  - Tailwind CSS IntelliSense
  - ES7+ React/Redux/React-Native snippets
  - Prettier

---

## STACK DE DESARROLLO

```
EOS Agent
├── Frontend: Next.js 14 (App Router)
├── Estilos: Tailwind CSS + CSS Variables
├── Animaciones: Framer Motion
├── Backend: Next.js API Routes (integrado)
├── Base de datos: Supabase
├── IA: Claude API (Anthropic)
└── Hosting: Vercel
```

---

## COMANDOS PARA INICIAR EL PROYECTO

Una vez instalado Node.js y Git, en tu terminal:

```bash
# Crear proyecto Next.js
npx create-next-app@latest eos-agent --typescript --tailwind --app

# Entrar al proyecto
cd eos-agent

# Instalar dependencias adicionales
npm install framer-motion @supabase/supabase-js

# Correr en local
npm run dev
```

El proyecto corre en: http://localhost:3000

---

## VARIABLES DE ENTORNO NECESARIAS

Crear archivo `.env.local` en la raíz del proyecto:

```
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_key_de_supabase
ANTHROPIC_API_KEY=tu_api_key_de_claude
```

---

## PRÓXIMOS PASOS

1. Crear las cuentas listadas arriba
2. Instalar Node.js y VS Code
3. Decirle a Claude que ya está listo → comenzamos con el código del dashboard

---

*Cuando tengas todo esto listo, dime y arrancamos a escribir código.*

*Última actualización: 2026-05-24*
