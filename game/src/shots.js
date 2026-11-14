// Deterministic ?shot= staging: every capture is produced by real game state
// (buy menu, a live firefight, a planted charge, a round-end banner) — never
// a fake overlay. main.js calls stageShot(name, ctx), renders twice, sets
// window.__shotReady and freezes. Seed fixed at 1.
import { CONFIG } from './config.js';
import { pushFeed } from './state.js';

function placeBot(bot, x, z, yaw) {
  bot.body.position.set(x, 0, z);
  bot.body.yaw = yaw;
  bot.group.position.set(x, 0, z);
  bot.group.rotation.y = yaw;
}

export function stageShot(name, ctx) {
  const { state, player, bots, weapons, hud, rounds } = ctx;
  const S = state;
  hud.hideOverlay();
  hud.hideBanner();
  S.started = true;
  if (name === 'buy') {
    // Buy phase: menu open, Longarm highlighted, $3,800, two friendly bots ahead.
    S.phase = 'buy';
    S.phaseTime = CONFIG.match.buySeconds;
    S.money = 3800;
    S.round = 2;
    S.emberScore = 1;
    S.ashScore = 1;
    weapons.switchTo('longarm');
    weapons.refillCurrent();
    player.body.position.set(0, 0, 14.5);
    player.body.yaw = Math.PI;
    player.body.pitch = 0;
    const friends = bots.bots.filter((b) => b.team === 'ember');
    placeBot(friends[0], -2.5, 10.5, Math.PI);
    placeBot(friends[1], 2.5, 9.5, Math.PI * 0.95);
    hud.showBuy(S.money, 'longarm');
    hud.setHint('Buy phase — press B to close, 1-6 to buy.');
  } else if (name === 'fight') {
    // Mid-round firefight in Mid Court: player firing the Longarm, an enemy
    // bot mid-strafe at ~12 m, muzzle flash + tracer + hitmarker live.
    S.phase = 'live';
    S.phaseTime = 62;
    S.round = 3;
    S.emberScore = 2;
    S.ashScore = 1;
    weapons.switchTo('longarm');
    weapons.state.mag = 24;
    weapons.state.reserve = 66;
    player.body.position.set(-1.5, 0, 6);
    player.body.yaw = Math.PI + 0.15;
    player.body.pitch = 0.02;
    const enemy = bots.bots.find((b) => b.team === 'ash');
    placeBot(enemy, 1.5, -6, 0.2);
    enemy.state = 'engage';
    ctx.firePlayerShot(true);
    hud.setHint('Plant the charge at A or B.');
  } else if (name === 'plant') {
    // Site A: charge planted, fuse 0:31, an enemy bot defusing in the open,
    // a friendly bot holding the angle, furnace glow behind.
    S.phase = 'live';
    S.phaseTime = 40;
    S.round = 4;
    S.emberScore = 2;
    S.ashScore = 2;
    S.bomb.planted = true;
    S.bomb.site = 'A';
    S.bomb.fuse = 31;
    S.bomb.x = -15.5;
    S.bomb.z = -10;
    weapons.switchTo('longarm');
    player.body.position.set(-11, 0, -5);
    player.body.yaw = Math.PI * 0.78;
    player.body.pitch = 0;
    const defuser = bots.bots.find((b) => b.team === 'ash');
    placeBot(defuser, -15.5, -10.5, Math.PI);
    defuser.state = 'defuse';
    S.bomb.defusing = defuser;
    S.bomb.defuseProgress = 0.4;
    const friend = bots.bots.find((b) => b.team === 'ember');
    placeBot(friend, -12.5, -6.5, Math.PI);
    friend.state = 'hold';
    pushFeed(S, 'You planted the charge at Site A');
    pushFeed(S, 'Cinder dropped Slag');
  } else if (name === 'end') {
    // Round end: detonation banner, score 4-2, kill feed, yard behind.
    S.phase = 'roundEnd';
    S.phaseTime = CONFIG.match.roundEndSeconds;
    S.roundReason = 'CHARGE DETONATED — EMBER WINS THE ROUND';
    S.emberScore = 4;
    S.ashScore = 2;
    S.round = 7;
    weapons.switchTo('longarm');
    player.body.position.set(-6, 0, 2);
    player.body.yaw = Math.PI * 0.85;
    player.body.pitch = 0;
    pushFeed(S, 'You planted the charge at Site A');
    pushFeed(S, 'Flint dropped Pumice');
    pushFeed(S, 'Kiln dropped Mortar');
    hud.showBanner(S.roundReason);
    hud.setHint('');
  }
  ctx.syncHud();
}

// shots.json records {name, query} per shot so the capture is reproducible.
export const SHOT_QUERIES = {
  buy: '?shot=buy&seed=1',
  fight: '?shot=fight&seed=1',
  plant: '?shot=plant&seed=1',
  end: '?shot=end&seed=1',
};
