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

// The yaw that faces a body at (x, z) toward (tx, tz). The engine's forward
// is (-sin yaw, -cos yaw), so yaw = atan2(-(tx - x), -(tz - z)) — the same
// formula bots.js aims with. v1 staged its scenes with spawn-style yaws
// around PI, which face +z (the south wall): the buy frame stared at that
// wall with its bots behind the camera, the fight shot fired into it from
// the boot camera position, and the plant frame faced away from the site.
function faceYaw(x, z, tx, tz) {
  return Math.atan2(-(tx - x), -(tz - z));
}

export function stageShot(name, ctx) {
  const { state, player, bots, weapons, hud, rounds } = ctx;
  const S = state;
  hud.hideOverlay();
  hud.hideBanner();
  S.started = true;
  if (name === 'buy') {
    // Buy phase on the A-Long lane, looking north: menu open, Longarm
    // highlighted, $3,800. The menu is a centered panel (~±0.41 NDC), so the
    // two Ember bots flank it clear of its edges and the north kiln's
    // glowing mouth clears its left edge, furnace light pooling behind.
    S.phase = 'buy';
    S.phaseTime = CONFIG.match.buySeconds;
    S.money = 3800;
    S.round = 2;
    S.emberScore = 1;
    S.ashScore = 1;
    weapons.switchTo('longarm');
    weapons.refillCurrent();
    player.body.position.set(-10.5, 0, 3.5);
    player.body.yaw = 0.0;
    player.body.pitch = 0;
    const friends = bots.bots.filter((b) => b.team === 'ember');
    placeBot(friends[0], -15.5, -1.0, 0.15);
    placeBot(friends[1], -5.5, -2.5, 0.1);
    hud.showBuy(S.money, 'longarm');
    hud.setHint('Buy phase — press B to close, 1-6 to buy.');
  } else if (name === 'fight') {
    // Mid-round firefight on the west lane into Mid Court: a two-round
    // Longarm burst into an Ash bot 12.4 m out — tracer, muzzle flash and
    // hitmarker all live — with three more bots in frame and a live HUD.
    // The lane (-4.5, 6) -> (-1.5, -6) clears the fountain pillar, which
    // the v1 line crossed.
    S.phase = 'live';
    S.phaseTime = 62;
    S.round = 3;
    S.emberScore = 2;
    S.ashScore = 1;
    weapons.switchTo('longarm');
    weapons.state.mag = 25;
    weapons.state.reserve = 66;
    player.body.position.set(-4.5, 0, 6);
    const ash = bots.bots.filter((b) => b.team === 'ash');
    const enemy = ash[0];
    placeBot(enemy, -1.5, -6, faceYaw(-1.5, -6, -4.5, 6));
    enemy.state = 'engage';
    placeBot(ash[1], 3.5, -3, faceYaw(3.5, -3, -4.5, 6));
    ash[1].state = 'engage';
    placeBot(ash[2], -8, -11, faceYaw(-8, -11, -4.5, 6));
    ash[2].state = 'hold';
    const mate = bots.bots.find((b) => b.team === 'ember');
    placeBot(mate, -5.5, 0, faceYaw(-5.5, 0, -1.5, -6));
    mate.state = 'hold';
    // Aim at the target's torso (centre y 1.0 from the 1.6 eye, 12.4 m),
    // then sync the camera and the world matrices: at boot both still hold
    // spawn values, so a shot fired before this hits nothing staged.
    player.body.yaw = faceYaw(-4.5, 6, -1.5, -6);
    player.body.pitch = Math.asin((1.0 - 1.6) / Math.hypot(3, 12));
    ctx.syncCamera();
    ctx.scene.updateMatrixWorld(true);
    ctx.firePlayerShot(true);
    weapons.state.cooldown = 0;
    ctx.firePlayerShot(true);
    // The hit from the burst is real, but the HUD's 90 ms hitmarker hold
    // expires before any capture lands — re-arm it for the frozen frame.
    hud.hitMarker(false, 60000);
    hud.setHint('Plant the charge at A or B.');
  }
  else if (name === 'plant') {
    // Planted at Site A with 0:31 on the fuse: an Ash bot crouched at the
    // charge mid-defuse, an Ember bot holding the angle, charge mesh lit.
    // v1 faced the player away from the site and never synced the charge
    // visual, so the defuser stood at an empty spot out of frame.
    S.phase = 'live';
    S.phaseTime = 31;
    S.round = 4;
    S.emberScore = 2;
    S.ashScore = 2;
    S.bomb.planted = true;
    S.bomb.site = 'A';
    S.bomb.x = -15.5;
    S.bomb.z = -10;
    S.bomb.fuse = 31;
    weapons.switchTo('longarm');
    player.body.position.set(-11, 0, -5.5);
    player.body.yaw = faceYaw(-11, -5.5, -15.5, -10);
    player.body.pitch = 0;
    const defuser = bots.bots.find((b) => b.team === 'ash');
    placeBot(defuser, -15.1, -9.2, faceYaw(-15.1, -9.2, -15.5, -10));
    defuser.state = 'defuse';
    S.bomb.defusing = defuser;
    S.bomb.defuseProgress = 0.4;
    const friend = bots.bots.find((b) => b.team === 'ember');
    placeBot(friend, -12, -8.3, faceYaw(-12, -8.3, -15.5, -10));
    friend.state = 'hold';
    // The charge mesh only moves inside objective.syncVisual (a sim step);
    // shot mode never steps, so sync it once or it stays at the origin.
    ctx.objective.syncVisual(player.body);
    pushFeed(S, 'You planted the charge at Site A');
    pushFeed(S, 'Cinder dropped Slag');
  } else if (name === 'end') {
    // Round end: the charge has just detonated on Site A — banner, score
    // 4-2, kill feed, the player looking at the site they blew. Every value
    // is set directly here: shot mode never runs a sim step, so nothing may
    // depend on rounds.step / objective.step progression. (The first v2 end
    // staging called hud.showOverlay with a mode string the real HUD does
    // not know — its COPY lookup threw, stageShot died before syncHud, and
    // main.js's boot block never reached the renderer: boot-value HUD over
    // a black, never-drawn canvas.)
    S.phase = 'roundEnd';
    S.phaseTime = CONFIG.match.roundEndSeconds;
    S.roundReason = 'CHARGE DETONATED — EMBER WINS THE ROUND';
    S.emberScore = 4;
    S.ashScore = 2;
    S.round = 7;
    weapons.switchTo('longarm');
    // The charge is spent: no carrier, nothing left to plant or defuse, so
    // syncHud leaves the bomb line empty.
    S.player.carrying = false;
    S.bomb.carrier = null;
    S.bomb.site = 'A';
    S.bomb.x = -15.5;
    S.bomb.z = -10;
    S.bomb.fuse = 0;
    // Sync the charge visual while it is still flagged planted, so the
    // device sits at the detonation point in frame; the flag is cleared
    // before syncHud so the timer reads the round-end clock (0:04), not
    // the spent fuse. In shot mode nothing re-syncs the visual afterwards.
    S.bomb.planted = true;
    ctx.objective.syncVisual(player.body);
    S.bomb.planted = false;
    // Stand off the site and look at it: kiln mouths, the site decal and
    // the furnace light fill the frame behind the banner.
    player.body.position.set(-9, 0, -3);
    player.body.yaw = faceYaw(-9, -3, S.bomb.x, S.bomb.z);
    player.body.pitch = 0;
    ctx.syncCamera();
    ctx.scene.updateMatrixWorld(true);
    pushFeed(S, 'You planted the charge at Site A');
    pushFeed(S, 'Flint dropped Pumice');
    pushFeed(S, 'Kiln dropped Mortar');
    hud.showBanner(S.roundReason);
  } else {
    return false;
  }
  ctx.syncHud();
  if (name !== 'buy') hud.setHint(S.phase === 'live' ? 'Plant the charge at A or B.' : '');
  return true;
}

export const SHOT_QUERIES = ['?shot=buy&seed=1', '?shot=fight&seed=1', '?shot=plant&seed=1', '?shot=end&seed=1'];
