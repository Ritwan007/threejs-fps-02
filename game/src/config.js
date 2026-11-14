// Every tunable in one table, so the economy, the gunplay and the bot skill can
// each be read (and re-tuned) from a single place. No other module hard-codes
// a price, a damage number or a round timing.
//
// TUNING TARGET (bot duels): a decent player wins ~50-60% of duels standing
// still at 15 m, ~75%+ holding an angle crouched. Bots never have perfect aim:
// burst discipline + reaction delay + spread keep them fair.
export const CONFIG = {
  match: { roundsToWin: 7, maxRounds: 13, roundSeconds: 90, buySeconds: 12, fuseSeconds: 35, plantSeconds: 3.5, defuseSeconds: 5, defuseKitSeconds: 2.5, roundEndSeconds: 4 },
  economy: { startMoney: 800, winBonus: 3000, lossBonus: 1900, killBonus: 300, plantBonus: 300, defuseBonus: 300 },
  player: { walkSpeed: 5.2, crouchSpeed: 2.4, accel: 42, friction: 9, gravity: 20, jump: 6.2, health: 100, eyeStand: 1.6, eyeCrouch: 1.02, heightStand: 1.72, heightCrouch: 1.12, radius: 0.34 },
  // HEAD_MULT is the headshot multiplier per weapon (x4 rifle/pistol, x3 SMG, x2 shotgun pellets).
  weapons: {
    sidekick: { name: 'Sidekick', kind: 'pistol', price: 0, mag: 12, reserve: 48, gap: 0.18, auto: false, reload: 1.4, damage: 26, headMult: 4, spreadStill: 0.004, spreadMove: 0.03, range: 28, pellets: 1, bloom: 0.0015 },
    longarm: { name: 'Longarm', kind: 'rifle', price: 2700, mag: 30, reserve: 90, gap: 0.096, auto: true, reload: 1.9, damage: 34, headMult: 4, spreadStill: 0.0022, spreadMove: 0.028, range: 60, pellets: 1, bloom: 0.0022 },
    ratter: { name: 'Ratter', kind: 'smg', price: 1500, mag: 32, reserve: 96, gap: 0.065, auto: true, reload: 2.2, damage: 22, headMult: 3, spreadStill: 0.006, spreadMove: 0.045, range: 22, pellets: 1, bloom: 0.0035 },
    doorstop: { name: 'Doorstop', kind: 'shotgun', price: 1700, mag: 6, reserve: 24, gap: 0.85, auto: false, reload: 2.6, damage: 12, headMult: 2, spreadStill: 0.03, spreadMove: 0.05, range: 14, pellets: 8, bloom: 0.004 },
  },
  grenade: { name: 'Popper', price: 300, maxPerRound: 1, fuse: 3, radius: 6, damageCenter: 110, damageEdge: 25 },
  defuseKit: { name: 'Defuse Kit', price: 400 },
  bots: { countFriendly: 4, countEnemy: 5, skillMin: 0.8, skillMax: 1.15, reactionMin: 0.25, reactionMax: 0.45, visionRange: 30, visionCone: 100, hearShot: 18, hearStep: 8, hearBeep: 25, burstMin: 3, burstMax: 5, thinkHz: 10, retreatHp: 25 },
};

export const WEAPON_ORDER = ['sidekick', 'longarm', 'ratter', 'doorstop'];
// Buy-menu rows in display order: key 1-4 buys a weapon, 5 buys the grenade, 6 the kit.
export const BUY_ROWS = [
  { key: '1', id: 'sidekick' },
  { key: '2', id: 'longarm' },
  { key: '3', id: 'ratter' },
  { key: '4', id: 'doorstop' },
  { key: '5', id: 'grenade' },
  { key: '6', id: 'kit' },
];
