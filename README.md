# 🃏 Texas Hold'em Poker Online

Juego de póker multijugador (hasta 6 jugadores) con tiempo real vía Socket.io.

## 🚀 Deploy

### Opción 1: Render (RECOMENDADO para WebSockets)
1. Crea cuenta en [render.com](https://render.com)
2. New → Web Service → conecta tu repo de GitHub
3. Build command: `npm install`
4. Start command: `node server.js`
5. ✅ WebSockets funcionan nativamente

### Opción 2: Railway
1. Crea cuenta en [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Configura `PORT` como variable de entorno
4. ✅ WebSockets funcionan nativamente

### Opción 3: Vercel (limitado)
> ⚠️ Vercel no soporta WebSockets persistentes en funciones serverless.
> Para Vercel, necesitarías usar un servicio externo de Socket.io (Ably, Pusher, etc.)
> 
> **Recomendación: usa Render o Railway para este proyecto.**

### Local
```bash
npm install
npm run dev
# Abre http://localhost:3000
```

## 🎮 Cómo jugar
1. Entra a la URL del servidor
2. Escribe tu nombre y crea/únete a una sala
3. Espera a que se unan otros jugadores (mínimo 2, máximo 6)
4. El host presiona "Iniciar Juego"
5. ¡A jugar!

## 📋 Reglas implementadas
- Texas Hold'em estándar
- Blinds pequeño y grande automáticos
- Bet, Call, Raise, Fold, Check
- All-in
- Evaluación completa de manos (Royal Flush → Par)
- Side pots básicos

## 🛠 Stack
- **Backend:** Node.js + Express + Socket.io
- **Frontend:** HTML/CSS/JS vanilla
- **Tiempo real:** WebSockets
