// ============================================================
//  ROYAL HOLD'EM — Client
// ============================================================

const socket = io({ transports: ['websocket', 'polling'] });

let myId = null;
let myRoomId = null;
let myName = '';
let gameState = null;
let isMyTurn = false;

// ---- Screen Management ----

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---- LOBBY ----

function createRoom() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { showLobbyError('Ingresa tu nombre'); return; }
  myName = name;
  socket.emit('createRoom', { name }, (res) => {
    if (res.error) { showLobbyError(res.error); return; }
    myId = res.playerId;
    myRoomId = res.roomId;
    document.getElementById('roomCodeDisplay').textContent = res.roomId;
    document.getElementById('gameRoomCode').textContent = res.roomId;
    showScreen('waitingRoom');
  });
}

function joinRoom() {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!name) { showLobbyError('Ingresa tu nombre'); return; }
  if (!code) { showLobbyError('Ingresa el código de sala'); return; }
  myName = name;
  socket.emit('joinRoom', { roomId: code, name }, (res) => {
    if (res.error) { showLobbyError(res.error); return; }
    myId = res.playerId;
    myRoomId = res.roomId;
    document.getElementById('roomCodeDisplay').textContent = res.roomId;
    document.getElementById('gameRoomCode').textContent = res.roomId;
    showScreen('waitingRoom');
  });
}

function showLobbyError(msg) {
  const el = document.getElementById('lobbyError');
  el.textContent = msg;
  setTimeout(() => el.textContent = '', 3000);
}

function copyRoomCode() {
  navigator.clipboard?.writeText(myRoomId).then(() => {
    const btn = document.querySelector('.btn-icon');
    btn.textContent = '✅';
    setTimeout(() => btn.textContent = '📋', 1500);
  });
}

function leaveGame() {
  socket.disconnect();
  location.reload();
}

// ---- WAITING ROOM ----

function renderWaitingRoom(state) {
  const container = document.getElementById('waitingPlayers');
  container.innerHTML = '';
  for (const p of state.players) {
    const div = document.createElement('div');
    div.className = 'waiting-player';
    div.innerHTML = `
      <div class="avatar">${p.name[0].toUpperCase()}</div>
      <span>${p.name}</span>
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
    `;
    container.appendChild(div);
  }

  const startBtn = document.getElementById('startBtn');
  const hint = document.getElementById('waitingHint');
  const me = state.players.find(p => p.id === myId);

  if (me?.isHost) {
    startBtn.style.display = state.players.length >= 2 ? 'flex' : 'none';
    hint.textContent = state.players.length < 2 ? 'Necesitas al menos 2 jugadores' : '¡Listo para iniciar!';
  } else {
    startBtn.style.display = 'none';
    hint.textContent = 'Esperando al host para iniciar...';
  }
}

function startGame() {
  socket.emit('startGame');
}

function startNextHand() {
  socket.emit('nextHand');
  document.getElementById('showdownOverlay').classList.add('hidden');
}

// ---- GAME TABLE ----

const PHASE_NAMES = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
  waiting: 'Esperando'
};

const SUIT_CLASS = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };

function makeCard(card, small = false, revealed = false) {
  const div = document.createElement('div');
  if (!card) {
    div.className = `card back${small ? ' small' : ''} reveal`;
    return div;
  }
  const suitClass = SUIT_CLASS[card.suit] || 'spades';
  div.className = `card ${suitClass}${small ? ' small' : ''} reveal`;
  div.innerHTML = `
    <span class="rank">${card.rank}</span>
    <span class="suit-big">${card.suit}</span>
    <span class="rank-bot">${card.rank}</span>
  `;
  return div;
}

function makeFaceDownCard(small = false) {
  const div = document.createElement('div');
  div.className = `card back${small ? ' small' : ''}`;
  return div;
}

// Seat positions around the oval (for up to 6 players)
// Coordinates as % of table width/height, starting from bottom-center going clockwise
const SEAT_POSITIONS = [
  // We place other players, not self (self is fixed at bottom)
  { left: '50%', top: '12%' },  // top center
  { left: '15%', top: '22%' },  // top left
  { left: '82%', top: '22%' },  // top right
  { left: '12%', top: '65%' },  // bottom left
  { left: '85%', top: '65%' },  // bottom right
];

function renderGameState(state) {
  if (!state) return;
  gameState = state;

  const me = state.players.find(p => p.id === myId);
  const others = state.players.filter(p => p.id !== myId);

  // Phase
  document.getElementById('phaseTag').textContent = PHASE_NAMES[state.phase] || state.phase;
  document.getElementById('potAmount').textContent = state.pot;

  // My info
  if (me) {
    document.getElementById('myName').textContent = me.name;
    document.getElementById('myChips').textContent = `🪙 ${me.chips}`;
    const betEl = document.getElementById('myBet');
    if (me.bet > 0) {
      betEl.textContent = `Apuesta: ${me.bet}`;
      betEl.classList.remove('hidden');
    } else {
      betEl.classList.add('hidden');
    }

    // My cards
    const myCardsEl = document.getElementById('myCards');
    myCardsEl.innerHTML = '';
    if (me.cards && me.cards.length) {
      for (const c of me.cards) myCardsEl.appendChild(makeCard(c));
    } else if (me.cardCount > 0) {
      for (let i = 0; i < me.cardCount; i++) myCardsEl.appendChild(makeFaceDownCard());
    }
  }

  // Community cards
  const commEl = document.getElementById('communityCards');
  commEl.innerHTML = '';
  for (const c of state.community) {
    commEl.appendChild(makeCard(c));
  }

  // Other players' seats
  const seatsEl = document.getElementById('tableSeats');
  seatsEl.innerHTML = '';
  others.forEach((p, idx) => {
    if (idx >= SEAT_POSITIONS.length) return;
    const pos = SEAT_POSITIONS[idx];
    const seat = document.createElement('div');
    seat.className = 'seat';
    seat.style.left = pos.left;
    seat.style.top = pos.top;

    const badges = [];
    if (p.isDealer) badges.push('<span class="seat-badge badge-dealer">D</span>');
    if (p.isSmallBlind && state.phase !== 'waiting') badges.push('<span class="seat-badge badge-sb">SB</span>');
    if (p.isBigBlind && state.phase !== 'waiting') badges.push('<span class="seat-badge badge-bb">BB</span>');
    if (p.isCurrent && state.phase !== 'waiting') badges.push('<span class="seat-badge badge-active">▶ Turno</span>');
    if (p.folded) badges.push('<span class="seat-badge badge-folded">FOLD</span>');
    if (p.allIn) badges.push('<span class="seat-badge badge-allin">ALL-IN</span>');

    const cardHtml = state.phase !== 'waiting' && p.cardCount > 0
      ? `<div class="seat-cards">
           ${p.cards
             ? p.cards.map(c => {
                 const sc = SUIT_CLASS[c.suit] || 'spades';
                 return `<div class="card small ${sc}">
                   <span class="rank">${c.rank}</span>
                   <span class="suit-big">${c.suit}</span>
                   <span class="rank-bot">${c.rank}</span>
                 </div>`;
               }).join('')
             : Array(p.cardCount).fill('<div class="card small back"></div>').join('')
           }
         </div>`
      : '';

    seat.innerHTML = `
      ${cardHtml}
      <div class="seat-info">
        ${badges.join('')}
        <span class="seat-name" title="${p.name}">${p.name}</span>
        <span class="seat-chips">🪙 ${p.chips}</span>
        ${p.bet > 0 ? `<span class="seat-bet">${p.bet}</span>` : ''}
      </div>
    `;

    if (p.folded) seat.style.opacity = '0.45';
    seatsEl.appendChild(seat);
  });

  // Action panel
  const myTurn = me && state.players[state.currentPlayerIndex]?.id === myId && state.phase !== 'waiting';
  isMyTurn = myTurn;
  const actionPanel = document.getElementById('actionPanel');
  actionPanel.classList.toggle('hidden', !myTurn);

  if (myTurn && me) {
    const toCall = state.currentBet - (me.bet || 0);
    const canCheck = toCall === 0;
    document.getElementById('checkBtn').style.display = canCheck ? '' : 'none';
    const callBtn = document.getElementById('callBtn');
    callBtn.style.display = canCheck ? 'none' : '';
    callBtn.textContent = `Pagar ${Math.min(toCall, me.chips)}`;
    document.getElementById('callAmount').textContent = canCheck
      ? 'Tu turno — Puedes pasar o apostar'
      : `Apuesta actual: ${state.currentBet} · Para pagar: ${Math.min(toCall, me.chips)}`;
  }
}

function doAction(type) {
  if (!isMyTurn) return;
  socket.emit('action', { type });
  document.getElementById('actionPanel').classList.add('hidden');
  document.getElementById('raisePanel').classList.add('hidden');
}

function openRaise() {
  if (!isMyTurn || !gameState) return;
  const me = gameState.players.find(p => p.id === myId);
  if (!me) return;

  const panel = document.getElementById('raisePanel');
  const slider = document.getElementById('raiseSlider');
  const input = document.getElementById('raiseInput');
  const presets = document.getElementById('raisePresets');

  const minBet = gameState.currentBet + gameState.minRaise;
  const maxBet = me.chips + (me.bet || 0);

  slider.min = minBet;
  slider.max = maxBet;
  slider.value = Math.min(minBet, maxBet);
  input.min = minBet;
  input.max = maxBet;
  input.value = slider.value;

  // Presets
  presets.innerHTML = '';
  const presetAmounts = [
    { label: 'Min', val: minBet },
    { label: '½ Pot', val: Math.floor(gameState.pot / 2) },
    { label: 'Pot', val: gameState.pot },
    { label: '2x Pot', val: gameState.pot * 2 },
    { label: 'All-In', val: maxBet },
  ];
  for (const { label, val } of presetAmounts) {
    if (val < minBet || val > maxBet) continue;
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = `${label} (${val})`;
    btn.onclick = () => {
      slider.value = val;
      input.value = val;
    };
    presets.appendChild(btn);
  }

  panel.classList.remove('hidden');
  document.getElementById('actionPanel').classList.add('hidden');
}

function closeRaise() {
  document.getElementById('raisePanel').classList.add('hidden');
  document.getElementById('actionPanel').classList.remove('hidden');
}

function updateRaiseDisplay() {
  document.getElementById('raiseInput').value = document.getElementById('raiseSlider').value;
}

function syncSliderFromInput() {
  const input = document.getElementById('raiseInput');
  const slider = document.getElementById('raiseSlider');
  const val = parseInt(input.value);
  if (!isNaN(val)) slider.value = Math.min(Math.max(val, slider.min), slider.max);
}

function confirmRaise() {
  const amount = parseInt(document.getElementById('raiseInput').value);
  if (isNaN(amount)) return;
  socket.emit('action', { type: 'raise', amount });
  document.getElementById('raisePanel').classList.add('hidden');
}

// ---- SHOWDOWN ----

function renderShowdown(data) {
  const overlay = document.getElementById('showdownOverlay');
  overlay.classList.remove('hidden');

  const winnersEl = document.getElementById('showdownWinners');
  winnersEl.innerHTML = '';
  for (const w of data.winners) {
    const div = document.createElement('div');
    div.className = 'winner-entry';
    div.innerHTML = `
      <div class="winner-name">🏆 ${w.name}</div>
      <div class="winner-hand">${w.handName}</div>
      <div class="winner-chips">+${w.won} fichas</div>
    `;
    winnersEl.appendChild(div);
  }

  // Show winning cards
  const cardsEl = document.getElementById('showdownCards');
  cardsEl.innerHTML = '';
  for (const w of data.winners) {
    if (w.cards) {
      for (const c of w.cards) cardsEl.appendChild(makeCard(c));
    }
  }

  // Show "next hand" to host
  const nextBtn = document.getElementById('nextHandBtn');
  if (gameState) {
    const me = gameState.players.find(p => p.id === myId);
    nextBtn.style.display = me?.isHost ? 'block' : 'none';
  }
}

// ---- LOG ----

function addLog(msg, isChat = false) {
  const gameLog = document.getElementById('gameLog');
  const waitLog = document.getElementById('waitingLog');

  const entry = document.createElement('div');
  entry.className = `log-entry${isChat ? ' chat-msg' : ''}`;
  entry.innerHTML = msg;

  if (gameLog) {
    gameLog.appendChild(entry.cloneNode(true));
    gameLog.scrollTop = gameLog.scrollHeight;
  }

  if (waitLog) {
    waitLog.appendChild(entry);
    waitLog.scrollTop = waitLog.scrollHeight;
  }
}

// ---- CHAT ----

function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chat', { message: msg });
  input.value = '';
}

// ---- SOCKET EVENTS ----

socket.on('gameState', (state) => {
  gameState = state;

  if (state.phase === 'waiting') {
    const currentScreen = document.querySelector('.screen.active');
    if (currentScreen?.id === 'gameTable') {
      // Game ended, stay on table but show waiting UI
      renderGameState(state);
    } else {
      showScreen('waitingRoom');
      renderWaitingRoom(state);
    }
  } else {
    showScreen('gameTable');
    renderGameState(state);
  }
});

socket.on('showdown', (data) => {
  showScreen('gameTable');
  // Update state with revealed cards for a moment
  if (data.players) {
    renderGameState({ ...gameState, players: data.players, community: data.community });
  }
  renderShowdown(data);
});

socket.on('log', (msg) => {
  addLog(`<span style="color:var(--gold-dim)">▸</span> ${msg}`);
});

socket.on('chat', ({ name, message }) => {
  const isMe = name === myName;
  addLog(
    `<strong style="color:${isMe ? '#70e8a0' : 'var(--gold-light)'}">${name}:</strong> ${message}`,
    true
  );
});

socket.on('error', (msg) => {
  console.warn('Server error:', msg);
  // Could show a toast here
});

socket.on('disconnect', () => {
  addLog('⚠️ Desconectado del servidor...');
});

socket.on('connect', () => {
  if (myRoomId) addLog('✅ Reconectado');
});

// ---- KEYBOARD SHORTCUTS ----
document.addEventListener('keydown', (e) => {
  if (!isMyTurn) return;
  if (e.key === 'f' || e.key === 'F') doAction('fold');
  if (e.key === ' ') { e.preventDefault(); doAction('check'); }
  if (e.key === 'c' || e.key === 'C') doAction('call');
  if (e.key === 'r' || e.key === 'R') openRaise();
});

// Allow Enter to submit in lobby
document.getElementById('playerName')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createRoom();
});
document.getElementById('roomCodeInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});
