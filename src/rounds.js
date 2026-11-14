// Round flow: buy (12 s, frozen, buy menu) -> live (90 s) -> round-end banner
// (4 s) -> next buy; first to 7 takes the match (max 13 rounds). A round is
// won by eliminating the enemy team, by detonation, by defuse, or (no plant)
// by the clock running out — defenders win on timeout. Economy awards are
// paid here, in one place, from the config table.
import { CONFIG } from './config.js';
import { pushFeed } from './state.js';

export function createRounds(state) {
  function aliveCount(team) {
    if (team === 'ember') return (state.player.alive ? 1 : 0) + (state._bots ?? []).filter((b) => b.team === 'ember' && b.alive).length;
    return (state._bots ?? []).filter((b) => b.team === 'ash' && b.alive).length;
  }
  function award(winner) {
    const econ = CONFIG.economy;
    state.money += winner === 'ember' ? econ.winBonus : econ.lossBonus;
    if (winner === 'ember') state.emberScore += 1;
    else state.ashScore += 1;
  }
  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    state.phaseTime = CONFIG.match.roundEndSeconds;
    state.roundReason = reason;
    award(winner);
    if (state.emberScore >= CONFIG.match.roundsToWin || state.ashScore >= CONFIG.match.roundsToWin || state.round >= CONFIG.match.maxRounds) {
      state.winner = state.emberScore > state.ashScore ? 'ember' : state.ashScore > state.emberScore ? 'ash' : 'ember';
      state.phase = 'matchEnd';
      state.phaseTime = 0;
    }
  }
  function startRound() {
    state.round += 1;
    state.phase = 'buy';
    state.phaseTime = CONFIG.match.buySeconds;
    state.bomb = { carrier: 'player', planted: false, site: null, fuse: 0, plantProgress: 0, planting: null, defuseProgress: 0, defusing: null, x: 0, z: 0 };
    state.grenades.length = 0;
    state.player.grenades = 0;
    state.player.hasKit = false;
    state.player.carrying = true;
    state.player.alive = true;
    state.player.health = CONFIG.player.health;
  }
  function resetMatch() {
    state.round = 1;
    state.emberScore = 0;
    state.ashScore = 0;
    state.winner = null;
    state.money = CONFIG.economy.startMoney;
    state.kills = 0;
    state.deaths = 0;
    state.feed.length = 0;
    state.phase = 'buy';
    state.phaseTime = CONFIG.match.buySeconds;
    state.bomb = { carrier: 'player', planted: false, site: null, fuse: 0, plantProgress: 0, planting: null, defuseProgress: 0, defusing: null, x: 0, z: 0 };
    state.grenades.length = 0;
    state.player.grenades = 0;
    state.player.hasKit = false;
    state.player.carrying = true;
    state.player.alive = true;
    state.player.health = CONFIG.player.health;
  }
  return {
    aliveCount,
    endRound,
    startRound,
    resetMatch,
    // Called every fixed step; returns nothing — it moves phases and checks
    // the elimination / timeout win conditions.
    step(dt) {
      state.phaseTime -= dt;
      if (state.phase === 'buy') {
        if (state.phaseTime <= 0) {
          state.phase = 'live';
          state.phaseTime = CONFIG.match.roundSeconds;
        }
        return;
      }
      if (state.phase === 'live') {
        if (aliveCount('ember') === 0) { endRound('ash', 'ELIMINATION — ASH WINS THE ROUND'); return; }
        if (aliveCount('ash') === 0) { endRound('ember', 'ELIMINATION — EMBER WINS THE ROUND'); return; }
        if (state.phaseTime <= 0 && !state.bomb.planted) { endRound('ash', 'TIME — YARD HELD'); }
        return;
      }
      if (state.phase === 'roundEnd' && state.phaseTime <= 0) startRound();
    },
    // Buy menu: returns a message string, or null when the purchase is invalid.
    buy(id) {
      if (state.phase !== 'buy') return 'Buy phase is over.';
      const econ = CONFIG.economy;
      if (id === 'grenade') {
        if (state.player.grenades >= CONFIG.grenade.maxPerRound) return 'Only one Popper per round.';
        if (state.money < CONFIG.grenade.price) return 'Not enough money.';
        state.money -= CONFIG.grenade.price;
        state.player.grenades += 1;
        return 'Popper bought.';
      }
      if (id === 'kit') {
        if (state.player.hasKit) return 'Defuse kit already owned.';
        if (state.money < CONFIG.defuseKit.price) return 'Not enough money.';
        state.money -= CONFIG.defuseKit.price;
        state.player.hasKit = true;
        return 'Defuse Kit bought.';
      }
      const w = CONFIG.weapons[id];
      if (!w) return null;
      if (state.money < w.price && state.player.weapon !== id) return 'Not enough money.';
      if (state.player.weapon === id) {
        if (state.money < Math.floor(w.price / 2)) return 'Not enough money for ammo.';
        state.money -= Math.floor(w.price / 2);
        state._buyRefill = id;
        return `${w.name} ammo refilled.`;
      }
      state.money -= w.price;
      state._buyWeapon = id;
      return `${w.name} bought.`;
    },
    killReward(killerIsPlayer) {
      if (killerIsPlayer) {
        state.money += CONFIG.economy.killBonus;
        state.kills += 1;
      }
    },
  };
}
