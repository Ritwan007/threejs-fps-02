// Kiln Yard — boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. All gameplay runs in step(); rendering only reads
// state. ?shot=buy|fight|plant|end with &seed=N stages a deterministic frame
// for a capture, renders it twice, then freezes and sets window.__shotReady.
// Import order is the order the dossier presents the game: state, config,
// map, nav, bots, weapons, shoot, objective, rounds, player, input, audio,
// effects, hud, util, shots.
import * as THREE from 'three';
import { createState, pushFeed, pushEvent } from './state.js';
import { CONFIG } from './config.js';
import { createMap } from './map.js';
import { createNav } from './nav.js';
import { createBots } from './bots.js';
import { createWeapons, throwGrenade, stepGrenades } from './weapons.js';
import { createShoot, makeHitMeshes } from './shoot.js';
import { createObjective } from './objective.js';
import { createRounds } from './rounds.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { mulberry32, clock } from './util.js';
import { stageShot } from './shots.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#17130f');
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const state = createState();
const nav = createNav();
const world = createMap(scene);
const shootApi = createShoot();
const audio = createAudio();
const fx = createEffects(scene, camera);
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const objective = createObjective(scene, state);
const rounds = createRounds(state);
const bots = createBots(scene, state, nav, world.colliders, world.shootables, rng, shootApi, fx);
state._bots = bots.bots;
bots.setPlayerBody(player.body);

// The player's hitboxes: invisible boxes (opacity 0, still raycast) tagged
// with the same part names as the bots, so one ray resolves every hit.
const playerHitGroup = new THREE.Group();
const playerHitMeshes = makeHitMeshes({ kind: 'player' }, '#ff8c2e');
for (const m of playerHitMeshes) {
  m.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  m.castShadow = false;
  playerHitGroup.add(m);
}
scene.add(playerHitGroup);

let targets = [];
function rebuildTargets() {
  targets = [...world.shootables];
  for (const bot of bots.bots) targets.push(...bot.hitMeshes);
  targets.push(...playerHitMeshes);
}

const hud = createHud(onBuy);
const input = createInput(renderer.domElement, onLockChange);
const body = player.body;
let frozen = false;
let started = false;
let buyOpen = false;
let prevPhase = state.phase;
let stepDistance = 0;
let lastX = body.position.x;
let lastZ = body.position.z;

// One damage function for player and bots: the killer gets the kill reward,
// the feed, and the callout; the victim falls over (bots) or spectates.
function damage(target, amount, attacker) {
  if (!target) return;
  if (target.kind === 'player') {
    if (!state.player.alive) return;
    state.player.health -= amount;
    hud.damageFlash();
    if (state.player.health <= 0) {
      state.player.health = 0;
      state.player.alive = false;
      state.deaths += 1;
      const killer = attacker?.name ?? 'an Ash defender';
      pushFeed(state, `${killer} dropped You`);
      const friend = bots.bots.find((b) => b.team === 'ember' && b.alive);
      state.spectate = friend ? friend.id : null;
      if (state.bomb.carrier === 'player') objective.handOffCarrier();
      hud.showOverlay('dead', `You were dropped by ${killer} — spectating your squad.`);
      if (document.pointerLockElement) document.exitPointerLock();
    }
    return;
  }
  const bot = bots.bots.find((b) => b.id === target.id);
  if (!bot || !bot.alive) return;
  bot.health -= amount;
  const byPlayer = attacker === 'player';
  if (byPlayer) hud.hitMarker(bot.health <= 0, 90);
  if (bot.health <= 0) {
    bot.health = 0;
    bot.alive = false;
    bot.deadAt = state.time;
    if (byPlayer) {
      audio.kill();
      rounds.killReward(true);
      pushFeed(state, `You dropped ${bot.name}  +$${CONFIG.economy.killBonus}`);
    } else {
      pushFeed(state, `${attacker?.name ?? 'A bot'} dropped ${bot.name}`);
    }
    bots.onTeammateDown(bot.body.position.x, bot.body.position.z, attacker === 'player' ? body.position.x : attacker?.body?.position.x ?? 0, attacker === 'player' ? body.position.z : attacker?.body?.position.z ?? 0);
    if (state.bomb.carrier === bot.id) objective.handOffCarrier();
  } else if (byPlayer) {
    audio.hit();
  }
}

const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
function firePlayerShot(staged = false) {
  if (!weapons.canFire()) { if (weapons.state.mag === 0) audio.dry(); return false; }
  if (!weapons.takeRound()) return false;
  const w = CONFIG.weapons[weapons.state.id];
  const spread = weapons.spread(player.groundSpeed(), body.crouching, !body.onGround);
  camera.getWorldPosition(_muzzle);
  const res = shootApi.fire(_muzzle, body.yaw, body.pitch, staged ? 0 : spread, rng, targets);
  fx.tracer(_muzzle, res.point);
  fx.muzzle();
  audio.shot(w.kind);
  player.recoil(0.009 + rng() * 0.004, (rng() * 2 - 1) * 0.004);
  weapons.pullTrigger(state.time);
  pushEvent(state, 'shot', body.position.x, body.position.z);
  if (res.target && !res.blocked) damage(res.target, shootApi.damageFor(w, res.part, res.distance), 'player');
  else if (res.blocked) fx.impact(res.point, 10);
  syncHud();
  return true;
}

function onBuy(id) {
  const msg = rounds.buy(id);
  hud.buyMessage(msg ?? '');
  if (msg && !msg.startsWith('Not') && !msg.startsWith('Only') && !msg.startsWith('Buy phase') && !msg.startsWith('Defuse')) {
    if (state._buyWeapon) { weapons.switchTo(state._buyWeapon); weapons.refillCurrent(); state._buyWeapon = null; audio.buy(); }
    else if (state._buyRefill) { weapons.refillCurrent(); state._buyRefill = null; audio.buy(); }
    else audio.buy();
  }
  syncHud();
}

function resetPositions() {
  body.position.set(0, 0, 14.5);
  body.velocity.set(0, 0, 0);
  body.yaw = Math.PI;
  body.pitch = 0;
  state.player.alive = true;
  state.player.health = CONFIG.player.health;
  state.spectate = null;
  bots.resetRound(state.round);
  rebuildTargets();
  weapons.refillCurrent();
  state.player.weapon = weapons.state.id;
  hud.hideBanner();
  hud.hideOverlay();
}

function syncHud() {
  state.player.weapon = weapons.state.id;
  hud.setHealth(state.player.health);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, CONFIG.weapons[weapons.state.id].name, state.player.grenades);
  hud.setMoney(state.money);
  hud.setTimer(state.phaseTime, state.bomb.planted, state.bomb.fuse);
  hud.setScore(state.emberScore, state.ashScore);
  hud.setPips(rounds.aliveCount('ember'), rounds.aliveCount('ash'));
  hud.setFeed(state.feed, state.time);
  hud.setCrosshair(weapons.spread(player.groundSpeed(), body.crouching, !body.onGround));
  const bomb = state.bomb;
  if (bomb.planted) hud.setBombLine(`CHARGE PLANTED — SITE ${bomb.site} — ${clock(bomb.fuse)}`);
  else if (bomb.plantProgress > 0) hud.setBombLine(`PLANTING… ${Math.round(bomb.plantProgress * 100)}%`);
  else if (bomb.defuseProgress > 0) hud.setBombLine(`DEFUSE IN PROGRESS… ${Math.round(bomb.defuseProgress * 100)}%`);
  else if (state.player.carrying && state.bomb.carrier === 'player') hud.setBombLine('YOU CARRY THE CHARGE — HOLD E AT A OR B');
  else hud.setBombLine('');
  if (state.phase === 'buy') hud.setHint('Buy phase — B for the buy menu, then push a site.');
  else if (!state.player.alive) hud.setHint('Spectating your squad.');
  else if (!bomb.planted) hud.setHint('Plant the charge at A or B.');
  else hud.setHint(`Charge planted at Site ${bomb.site} — hold the site!`);
  hud.setSpectate(!state.player.alive && state.spectate !== null ? `Spectating ${bots.bots.find((b) => b.id === state.spectate)?.name ?? 'squad'}` : '');
}

function syncCamera() {
  const shake = fx.shakeOffset();
  const sx = shake ? (rng() - 0.5) * shake * 0.12 : 0;
  const sy = shake ? (rng() - 0.5) * shake * 0.12 : 0;
  if (!state.player.alive && state.spectate !== null) {
    const bot = bots.bots.find((b) => b.id === state.spectate);
    if (bot && bot.alive) {
      camera.position.set(bot.body.position.x + sx, bot.body.position.y + bot.body.eye + sy, bot.body.position.z);
      camera.rotation.set(bot.body.pitch, bot.body.yaw, 0, 'YXZ');
      return;
    }
  }
  camera.position.set(body.position.x + sx, body.position.y + body.eye + sy, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function resolveObjectiveActor() {
  const actor = {};
  const bomb = state.bomb;
  if (!bomb.planted) {
    if (bomb.carrier === 'player' && state.player.alive && input.state.keys.has('KeyE')) {
      actor.planting = { x: body.position.x, z: body.position.z };
    } else if (typeof bomb.carrier === 'number') {
      const carrier = bots.bots.find((b) => b.id === bomb.carrier);
      if (carrier && carrier.alive && carrier.state === 'plant') actor.planting = { x: carrier.body.position.x, z: carrier.body.position.z };
    }
  } else {
    const defuser = bots.bots.find((b) => b.team === 'ash' && b.alive && b.state === 'defuse');
    if (defuser) actor.defusing = defuser;
  }
  return actor;
}

function step(dt) {
  state.time += dt;
  const before = state.phase;
  rounds.step(dt);
  if (state.phase === 'buy' && before !== 'buy') {
    // New round: respawn everyone at their spawn, reset the charge.
    resetPositions();
    hud.showBuy(state.money, weapons.state.id);
    buyOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  if (state.phase === 'live' && before === 'buy') { hud.hideBuy(); buyOpen = false; }
  if (state.phase === 'roundEnd' && before === 'live') {
    hud.showBanner(state.roundReason);
    if (state.winner) audio.win(); else if (state.roundReason.includes('EMBER')) audio.win(); else audio.lose();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  if (state.phase === 'matchEnd' && before !== 'matchEnd') {
    const w = state.winner === 'ember' ? 'EMBER' : 'ASH';
    hud.showOverlay('match', `${w} TAKES THE YARD ${state.emberScore}–${state.ashScore}.`);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  if (state.phase === 'live' || state.phase === 'buy') {
    if (started && input.state.locked && state.player.alive) player.step(dt, input.state.keys);
    if (state.phase === 'live') {
      bots.step(dt, state.time, damage, targets);
      state.events.length = 0; // bots have read this step's hearing events; later pushes survive to the next step
      const event = objective.step(dt, resolveObjectiveActor(), body, audio);
      if (event === 'planted') {
        pushFeed(state, `Charge planted at Site ${state.bomb.site}`);
        state.money += CONFIG.economy.plantBonus;
        pushEvent(state, 'shot', state.bomb.x, state.bomb.z);
      } else if (event === 'detonated') {
        fx.explosion(new THREE.Vector3(state.bomb.x, 0.6, state.bomb.z));
        audio.explosion();
        rounds.endRound('ember', 'CHARGE DETONATED — EMBER WINS THE ROUND');
        hud.showBanner(state.roundReason);
      } else if (event === 'defused') {
        rounds.endRound('ash', 'CHARGE DEFUSED — ASH WINS THE ROUND');
        hud.showBanner(state.roundReason);
      }
      stepGrenades(state, world.colliders, (kind, g) => {
        if (kind === 'beep') { audio.grenadeBeep(); pushEvent(state, 'beep', g.x, g.z); return; }
        fx.explosion(new THREE.Vector3(g.x, g.y + 0.3, g.z));
        audio.explosion();
        fx.addShake(0.3);
        pushEvent(state, 'shot', g.x, g.z);
        const hurt = (x, z, record, isPlayer) => {
          const d = Math.hypot(x - g.x, z - g.z);
          if (d > CONFIG.grenade.radius) return;
          const dmg = Math.round(CONFIG.grenade.damageCenter + (CONFIG.grenade.damageEdge - CONFIG.grenade.damageCenter) * (d / CONFIG.grenade.radius));
          damage(record, dmg, 'player');
        };
        if (state.player.alive) hurt(body.position.x, body.position.z, { kind: 'player' }, true);
        for (const bot of bots.bots) if (bot.alive) hurt(bot.body.position.x, bot.body.position.z, { kind: 'bot', id: bot.id }, false);
      }, dt);
    }
  }
  weapons.step(dt, state.time, started && input.state.locked && (input.state.keys.has('KeyW') || input.state.keys.has('KeyA') || input.state.keys.has('KeyS') || input.state.keys.has('KeyD')));
  fx.step(dt);
  objective.syncVisual(body);
  playerHitGroup.position.set(body.position.x, body.position.y, body.position.z);
  playerHitGroup.rotation.y = body.yaw;
  // Footsteps: a soft tick every ~2.2 m while moving on the ground.
  const moved = Math.hypot(body.position.x - lastX, body.position.z - lastZ);
  lastX = body.position.x;
  lastZ = body.position.z;
  if (body.onGround && moved > 0) {
    stepDistance += moved;
    if (stepDistance > 2.2) { stepDistance = 0; audio.step(); }
  }
  syncHud();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    if (buyOpen) { hud.hideBuy(); buyOpen = false; }
  } else if (state.phase === 'matchEnd') {
    hud.showOverlay('match', `${state.winner === 'ember' ? 'EMBER' : 'ASH'} TAKES THE YARD ${state.emberScore}–${state.ashScore}.`);
  } else if (!state.player.alive && state.phase === 'live') {
    hud.showOverlay('dead', 'You were dropped — spectating your squad.');
  } else if (started && state.phase !== 'buy' && !buyOpen) {
    hud.showOverlay('paused');
  }
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked) player.look(look.x, look.y);
    const pressed = input.takePressed();
    for (const code of pressed) {
      if (code === 'KeyR' && state.player.alive) { if (weapons.reload()) audio.reload(); }
      else if (code === 'KeyB' && state.phase === 'buy') {
        buyOpen = !buyOpen;
        if (buyOpen) { hud.showBuy(state.money, weapons.state.id); if (document.pointerLockElement) document.exitPointerLock(); }
        else { hud.hideBuy(); input.requestLock(); }
      } else if ((code === 'KeyG' || code === 'Digit4') && state.phase === 'live' && state.player.alive && state.player.grenades > 0) {
        state.player.grenades -= 1;
        camera.getWorldDirection(_dir);
        throwGrenade(state, camera.position, _dir);
        pushEvent(state, 'beep', body.position.x, body.position.z);
        syncHud();
      } else if (code === 'KeyM') {
        state.muted = !state.muted;
        audio.setMuted(state.muted);
      } else if (code.startsWith('Digit') && buyOpen && state.phase === 'buy') {
        const row = { Digit1: 'sidekick', Digit2: 'longarm', Digit3: 'ratter', Digit4: 'doorstop', Digit5: 'grenade', Digit6: 'kit' }[code];
        if (row) onBuy(row);
      }
    }
    if (input.state.firing && input.state.locked && state.player.alive && state.phase === 'live') firePlayerShot();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'matchEnd') {
    rounds.resetMatch();
    resetPositions();
    hud.showBuy(state.money, weapons.state.id);
    buyOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Boot: spawn both teams, build the raycast target list, show the start screen.
bots.resetRound(1);
rebuildTargets();
syncHud();
syncCamera();
if (shot) {
  const ctx = { state, player, bots, weapons, hud, rounds, firePlayerShot, syncHud };
  stageShot(shot, ctx);
  syncCamera();
  paintTwiceThenReady();
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
