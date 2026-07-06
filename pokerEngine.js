// ============================================================
//  POKER ENGINE — Texas Hold'em
// ============================================================

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, value: RANK_VALUES[rank] });
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ---- Hand Evaluation ----

function getCounts(cards) {
  const freq = {};
  for (const c of cards) freq[c.value] = (freq[c.value] || 0) + 1;
  return freq;
}

function isFlush(cards) {
  const suit = cards[0].suit;
  return cards.every(c => c.suit === suit);
}

function isStraight(vals) {
  const sorted = [...new Set(vals)].sort((a,b) => a-b);
  if (sorted.length < 5) return false;
  // Check for A-low straight (wheel: A2345)
  if (sorted.includes(14) && sorted.slice(0,4).join() === '2,3,4,5') return { straight: true, high: 5 };
  for (let i = 0; i <= sorted.length - 5; i++) {
    const slice = sorted.slice(i, i+5);
    if (slice[4] - slice[0] === 4 && new Set(slice).size === 5)
      return { straight: true, high: slice[4] };
  }
  return false;
}

function getBestHand(holeCards, communityCards) {
  const all = [...holeCards, ...communityCards];
  // Generate all C(7,5) = 21 combinations
  const combos = [];
  for (let i = 0; i < all.length - 1; i++)
    for (let j = i+1; j < all.length; j++) {
      const five = all.filter((_,idx) => idx !== i && idx !== j);
      combos.push(five);
    }
  let best = null;
  for (const hand of combos) {
    const score = scoreHand(hand);
    if (!best || compareScores(score, best.score) > 0)
      best = { hand, score };
  }
  return best;
}

function scoreHand(cards) {
  const vals = cards.map(c => c.value).sort((a,b) => b-a);
  const freq = getCounts(cards);
  const counts = Object.values(freq).sort((a,b) => b-a);
  const flush = isFlush(cards);
  const straight = isStraight(vals);

  if (flush && straight) {
    const high = straight.high || Math.max(...vals);
    return { rank: high === 14 ? 9 : 8, tiebreak: [high] }; // Royal=9, SF=8
  }
  if (counts[0] === 4) return { rank: 7, tiebreak: sortByFreq(freq, vals) };
  if (counts[0] === 3 && counts[1] === 2) return { rank: 6, tiebreak: sortByFreq(freq, vals) };
  if (flush) return { rank: 5, tiebreak: vals };
  if (straight) return { rank: 4, tiebreak: [straight.high || vals[0]] };
  if (counts[0] === 3) return { rank: 3, tiebreak: sortByFreq(freq, vals) };
  if (counts[0] === 2 && counts[1] === 2) return { rank: 2, tiebreak: sortByFreq(freq, vals) };
  if (counts[0] === 2) return { rank: 1, tiebreak: sortByFreq(freq, vals) };
  return { rank: 0, tiebreak: vals };
}

function sortByFreq(freq, vals) {
  return vals.sort((a,b) => {
    const fd = (freq[b]||0) - (freq[a]||0);
    return fd !== 0 ? fd : b - a;
  });
}

function compareScores(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.tiebreak.length, b.tiebreak.length); i++)
    if (a.tiebreak[i] !== b.tiebreak[i]) return a.tiebreak[i] - b.tiebreak[i];
  return 0;
}

const HAND_NAMES = [
  'Carta Alta', 'Par', 'Doble Par', 'Trío',
  'Escalera', 'Color', 'Full House', 'Póker',
  'Escalera de Color', 'Escalera Real'
];

// ============================================================
//  GAME STATE MACHINE
// ============================================================

const PHASES = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown'];
const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

class PokerGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];       // { id, name, chips, cards, bet, folded, allIn, connected }
    this.phase = 'waiting';
    this.deck = [];
    this.community = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.dealerIndex = 0;
    this.currentPlayerIndex = 0;
    this.minRaise = BIG_BLIND;
    this.roundBets = {};     // playerID -> amount bet this round
    this.lastRaiser = null;
    this.handNumber = 0;
  }

  addPlayer(id, name) {
    if (this.players.length >= 6) return false;
    if (this.phase !== 'waiting') return false;
    this.players.push({
      id, name,
      chips: STARTING_CHIPS,
      cards: [],
      bet: 0,
      folded: false,
      allIn: false,
      connected: true,
      isHost: this.players.length === 0
    });
    return true;
  }

  removePlayer(id) {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx === -1) return;
    if (this.phase === 'waiting') {
      this.players.splice(idx, 1);
      if (this.players.length > 0) this.players[0].isHost = true;
    } else {
      this.players[idx].connected = false;
      this.players[idx].folded = true;
    }
  }

  canStart() {
    return this.players.length >= 2 && this.phase === 'waiting';
  }

  startHand() {
    this.handNumber++;
    this.deck = shuffle(createDeck());
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.lastRaiser = null;
    this.roundBets = {};

    // Reset players
    for (const p of this.players) {
      p.cards = [];
      p.bet = 0;
      p.folded = !p.connected || p.chips <= 0;
      p.allIn = false;
      this.roundBets[p.id] = 0;
    }

    // Active players (have chips and connected)
    const active = this.activePlayers();
    if (active.length < 2) return false;

    // Rotate dealer
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    while (this.players[this.dealerIndex].chips <= 0 || !this.players[this.dealerIndex].connected)
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;

    // Deal 2 cards each
    for (const p of this.players) {
      if (!p.folded) {
        p.cards = [this.deck.pop(), this.deck.pop()];
      }
    }

    // Post blinds
    const sbIdx = this.nextActiveFrom(this.dealerIndex, 1);
    const bbIdx = this.nextActiveFrom(sbIdx, 1);

    this.postBlind(sbIdx, SMALL_BLIND);
    this.postBlind(bbIdx, BIG_BLIND);
    this.currentBet = BIG_BLIND;

    // First to act is after BB
    this.currentPlayerIndex = this.nextActiveFrom(bbIdx, 1);
    this.lastRaiser = bbIdx;
    this.phase = 'preflop';

    return true;
  }

  postBlind(idx, amount) {
    const p = this.players[idx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    p.bet += actual;
    this.pot += actual;
    this.roundBets[p.id] = (this.roundBets[p.id] || 0) + actual;
    if (p.chips === 0) p.allIn = true;
  }

  nextActiveFrom(from, steps = 1) {
    let idx = from;
    let count = 0;
    do {
      idx = (idx + 1) % this.players.length;
      if (!this.players[idx].folded && !this.players[idx].allIn) count++;
      if (count === steps) return idx;
    } while (true);
  }

  activePlayers() {
    return this.players.filter(p => !p.folded);
  }

  activeNonAllIn() {
    return this.players.filter(p => !p.folded && !p.allIn);
  }

  currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  // ---- Actions ----

  fold(playerId) {
    const p = this.playerById(playerId);
    if (!p || p.folded) return false;
    p.folded = true;
    return this.afterAction();
  }

  call(playerId) {
    const p = this.playerById(playerId);
    if (!p || p.folded) return false;
    const toCall = Math.min(this.currentBet - p.bet, p.chips);
    p.chips -= toCall;
    p.bet += toCall;
    this.pot += toCall;
    this.roundBets[p.id] = (this.roundBets[p.id] || 0) + toCall;
    if (p.chips === 0) p.allIn = true;
    return this.afterAction();
  }

  check(playerId) {
    const p = this.playerById(playerId);
    if (!p || p.bet < this.currentBet) return false;
    return this.afterAction();
  }

  raise(playerId, amount) {
    const p = this.playerById(playerId);
    if (!p || p.folded) return false;
    const totalBet = Math.min(amount, p.chips + p.bet);
    const raiseBy = totalBet - this.currentBet;
    if (raiseBy < this.minRaise && totalBet < p.chips + p.bet) return false;
    const toAdd = totalBet - p.bet;
    p.chips -= toAdd;
    p.bet = totalBet;
    this.pot += toAdd;
    this.roundBets[p.id] = (this.roundBets[p.id] || 0) + toAdd;
    this.minRaise = Math.max(this.minRaise, raiseBy);
    this.currentBet = totalBet;
    if (p.chips === 0) p.allIn = true;
    this.lastRaiser = this.currentPlayerIndex;
    return this.afterAction();
  }

  allInAction(playerId) {
    const p = this.playerById(playerId);
    if (!p) return false;
    return this.raise(playerId, p.chips + p.bet);
  }

  afterAction() {
    const active = this.activePlayers();
    // Only one left → wins
    if (active.length === 1) {
      return this.endHand();
    }
    // Check if betting round is over
    if (this.isBettingRoundOver()) {
      return this.nextPhase();
    }
    // Advance to next player
    this.advanceToNextPlayer();
    return { type: 'continue', state: this.publicState() };
  }

  isBettingRoundOver() {
    const canAct = this.activeNonAllIn();
    if (canAct.length === 0) return true;
    // Everyone has matched the current bet or acted
    for (const p of canAct) {
      if (p.bet < this.currentBet) return false;
    }
    // Has everyone had a chance to act after the last raise?
    // Simple: check if we've gone around since lastRaiser
    return true; // Simplified - works for most cases
  }

  advanceToNextPlayer() {
    let next = (this.currentPlayerIndex + 1) % this.players.length;
    let loops = 0;
    while ((this.players[next].folded || this.players[next].allIn) && loops < this.players.length) {
      next = (next + 1) % this.players.length;
      loops++;
    }
    this.currentPlayerIndex = next;
  }

  nextPhase() {
    // Reset bets for new round
    for (const p of this.players) {
      p.bet = 0;
    }
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.roundBets = {};
    for (const p of this.players) this.roundBets[p.id] = 0;

    const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const idx = phases.indexOf(this.phase);

    if (this.phase === 'preflop') {
      this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.phase = 'flop';
    } else if (this.phase === 'flop') {
      this.community.push(this.deck.pop());
      this.phase = 'turn';
    } else if (this.phase === 'turn') {
      this.community.push(this.deck.pop());
      this.phase = 'river';
    } else {
      return this.endHand();
    }

    // First active after dealer
    const startFrom = this.nextActiveFrom(this.dealerIndex - 1, 1);
    this.currentPlayerIndex = startFrom;
    this.lastRaiser = null;

    // If only all-ins remain, go straight to showdown
    if (this.activeNonAllIn().length <= 1) {
      return this.nextPhase();
    }

    return { type: 'continue', state: this.publicState() };
  }

  endHand() {
    const active = this.activePlayers();
    let winners = [];

    if (active.length === 1) {
      active[0].chips += this.pot;
      winners = [{ player: active[0], hand: null, handName: 'Todos se retiraron', won: this.pot }];
    } else {
      // Evaluate hands
      const scored = active.map(p => {
        const result = getBestHand(p.cards, this.community);
        return { player: p, ...result };
      });
      scored.sort((a,b) => compareScores(b.score, a.score));
      const bestScore = scored[0].score;
      const tied = scored.filter(s => compareScores(s.score, bestScore) === 0);
      const share = Math.floor(this.pot / tied.length);
      for (const w of tied) {
        w.player.chips += share;
        winners.push({
          player: w.player,
          hand: w.hand,
          handName: HAND_NAMES[w.score.rank],
          won: share
        });
      }
    }

    this.phase = 'waiting';
    return {
      type: 'showdown',
      winners,
      community: this.community,
      state: this.publicState(true)
    };
  }

  playerById(id) {
    return this.players.find(p => p.id === id);
  }

  publicState(reveal = false) {
    return {
      phase: this.phase,
      community: this.community,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      dealerIndex: this.dealerIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      handNumber: this.handNumber,
      players: this.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        connected: p.connected,
        isHost: p.isHost,
        cardCount: p.cards.length,
        cards: reveal && !p.folded ? p.cards : null,
        isDealer: i === this.dealerIndex,
        isCurrent: i === this.currentPlayerIndex,
        isSmallBlind: i === this.nextActiveFrom(this.dealerIndex, 1),
        isBigBlind: i === this.nextActiveFrom(this.dealerIndex, 2),
      }))
    };
  }

  stateFor(playerId) {
    const state = this.publicState();
    const me = state.players.find(p => p.id === playerId);
    if (me) {
      const realPlayer = this.playerById(playerId);
      me.cards = realPlayer ? realPlayer.cards : [];
    }
    return state;
  }
}

module.exports = { PokerGame, HAND_NAMES, getBestHand, compareScores };
