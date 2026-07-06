const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PokerGame } = require('./pokerEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));

// Rooms: { [roomId]: PokerGame }
const rooms = {};
// Player→Room mapping
const playerRoom = {};

// ---- Helper ----
function broadcastRoom(roomId, event, data) {
  io.to(roomId).emit(event, data);
}

function broadcastState(roomId) {
  const game = rooms[roomId];
  if (!game) return;
  // Send personalized state to each player
  for (const p of game.players) {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) sock.emit('gameState', game.stateFor(p.id));
  }
  // Send public state to spectators (future)
}

function handleActionResult(roomId, result) {
  const game = rooms[roomId];
  if (!game) return;

  if (result.type === 'showdown') {
    // Build winner info for announcement
    const winnerInfo = result.winners.map(w => ({
      name: w.player.name,
      handName: w.handName,
      won: w.won,
      cards: w.hand
    }));
    broadcastRoom(roomId, 'showdown', {
      winners: winnerInfo,
      community: result.community,
      players: result.state.players
    });
    // After delay, ready for next hand
    setTimeout(() => {
      broadcastState(roomId);
    }, 5000);
  } else {
    broadcastState(roomId);
  }
}

// ---- Socket Events ----
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // Create room
  socket.on('createRoom', ({ name }, cb) => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    rooms[roomId] = new PokerGame(roomId);
    const ok = rooms[roomId].addPlayer(socket.id, name);
    if (!ok) { cb({ error: 'No se pudo crear la sala' }); return; }
    socket.join(roomId);
    playerRoom[socket.id] = roomId;
    cb({ roomId, playerId: socket.id });
    broadcastState(roomId);
    broadcastRoom(roomId, 'log', `${name} creó la sala`);
  });

  // Join room
  socket.on('joinRoom', ({ roomId, name }, cb) => {
    const game = rooms[roomId];
    if (!game) { cb({ error: 'Sala no encontrada' }); return; }
    if (game.phase !== 'waiting') { cb({ error: 'Partida en curso' }); return; }
    if (game.players.length >= 6) { cb({ error: 'Sala llena (máx. 6)' }); return; }
    const ok = game.addPlayer(socket.id, name);
    if (!ok) { cb({ error: 'No se pudo unir' }); return; }
    socket.join(roomId);
    playerRoom[socket.id] = roomId;
    cb({ roomId, playerId: socket.id });
    broadcastState(roomId);
    broadcastRoom(roomId, 'log', `${name} se unió a la sala`);
  });

  // Start game
  socket.on('startGame', () => {
    const roomId = playerRoom[socket.id];
    const game = rooms[roomId];
    if (!game) return;
    const me = game.playerById(socket.id);
    if (!me || !me.isHost) return;
    if (!game.canStart()) {
      socket.emit('error', 'Necesitas mínimo 2 jugadores');
      return;
    }
    const ok = game.startHand();
    if (!ok) { socket.emit('error', 'No se pudo iniciar'); return; }
    broadcastRoom(roomId, 'log', '🃏 ¡Nueva mano iniciada!');
    broadcastState(roomId);
  });

  // Next hand
  socket.on('nextHand', () => {
    const roomId = playerRoom[socket.id];
    const game = rooms[roomId];
    if (!game || game.phase !== 'waiting') return;
    const me = game.playerById(socket.id);
    if (!me || !me.isHost) return;
    // Remove broke players
    game.players = game.players.filter(p => p.chips > 0 || p.id === socket.id);
    if (game.players.length < 2) {
      broadcastRoom(roomId, 'log', 'No hay suficientes jugadores con fichas');
      return;
    }
    const ok = game.startHand();
    if (ok) {
      broadcastRoom(roomId, 'log', `🃏 Mano #${game.handNumber} comenzó`);
      broadcastState(roomId);
    }
  });

  // Poker actions
  socket.on('action', ({ type, amount }) => {
    const roomId = playerRoom[socket.id];
    const game = rooms[roomId];
    if (!game || game.phase === 'waiting') return;
    const current = game.currentPlayer();
    if (!current || current.id !== socket.id) {
      socket.emit('error', 'No es tu turno');
      return;
    }

    let result;
    const me = game.playerById(socket.id);
    const name = me?.name || 'Jugador';

    switch (type) {
      case 'fold':
        result = game.fold(socket.id);
        broadcastRoom(roomId, 'log', `${name} se retiró`);
        break;
      case 'check':
        result = game.check(socket.id);
        broadcastRoom(roomId, 'log', `${name} pasó`);
        break;
      case 'call':
        result = game.call(socket.id);
        broadcastRoom(roomId, 'log', `${name} pagó ${game.currentBet}`);
        break;
      case 'raise':
        result = game.raise(socket.id, parseInt(amount));
        if (result) broadcastRoom(roomId, 'log', `${name} apostó ${amount}`);
        break;
      case 'allin':
        result = game.allInAction(socket.id);
        broadcastRoom(roomId, 'log', `${name} fue ALL-IN con ${me.chips + me.bet}`);
        break;
      default:
        return;
    }

    if (result) handleActionResult(roomId, result);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const roomId = playerRoom[socket.id];
    if (!roomId) return;
    const game = rooms[roomId];
    if (!game) return;
    const p = game.playerById(socket.id);
    const name = p?.name || 'Jugador';
    game.removePlayer(socket.id);
    delete playerRoom[socket.id];
    broadcastRoom(roomId, 'log', `${name} se desconectó`);
    broadcastState(roomId);

    // Cleanup empty rooms
    if (game.players.filter(p => p.connected).length === 0) {
      delete rooms[roomId];
    }
  });

  // Chat
  socket.on('chat', ({ message }) => {
    const roomId = playerRoom[socket.id];
    const game = rooms[roomId];
    if (!game) return;
    const p = game.playerById(socket.id);
    const name = p?.name || '???';
    broadcastRoom(roomId, 'chat', { name, message: message.slice(0, 100) });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🃏 Poker server on port ${PORT}`));
