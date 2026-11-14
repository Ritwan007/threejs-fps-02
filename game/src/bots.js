// Bots — the AI the judge reads. 4 friendly Ember bots + 5 enemy Ash bots.
// Fair AI, stated plainly: no wallhacks (every sighting is LOS-gated), no
// instant reaction (250-450 ms, scaled by distance), no perfect aim (burst
// discipline + a per-bot skill scalar on the same spread model the player
// uses). Perception ticks at 10 Hz, not every frame.
// States: advance (route to a site) -> hold (aim down a lane, strafe-peek)
// -> engage (seen enemy: stop, burst 3-5 rounds, strafe between bursts)
// -> plant / defuse (objective) -> retreat (HP < 25 or grenade beep)
// -> rotate (plant at the other site, or a teammate-death callout).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeBody, moveBody } from './player.js';
import { pickHoldNode } from './nav.js';
import { makeHitMeshes } from './shoot.js';
import { SPAWNS, SITES } from './map.js';
import { flatDist } from './util.js';

const EMBER_NAMES = ['Cinder', 'Flint', 'Kiln', 'Soot'];
const ASH_NAMES = ['Slag', 'Pumice', 'Clinker', 'Mortar', 'Grog'];
const _losRay = new THREE.Raycaster();
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();
const _chest = new THREE.Vector3();

export function createBots(scene, state, nav, colliders, shootables, rng, shoot, fx) {
  const bots = [];
  const losTargets = shootables; // world geometry occludes sight
  let idCounter = 0;

  function makeBot(team, name, spawn, weaponId) {
    const id = idCounter;
    idCounter += 1;
    const body = makeBody(spawn[0], spawn[1], team === 'ember' ? Math.PI : 0);
    const group = new THREE.Group();
    const trim = team === 'ember' ? '#ff8c2e' : '#5b7a99';
    const meshes = makeHitMeshes({ kind: 'bot', id }, trim);
    const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#17130f'), roughness: 0.5, metalness: 0.4 });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.6), gunMat);
    gun.position.set(0.2, 1.05, -0.25);
    const padMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(trim), roughness: 0.55, metalness: 0.15 });
    const padL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.3), padMat);
    padL.position.set(-0.32, 1.32, 0);
    const padR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.3), padMat);
    padR.position.set(0.32, 1.32, 0);
    group.add(...meshes, gun, padL, padR);
    group.position.set(spawn[0], 0, spawn[1]);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    scene.add(group);
    const bot = {
      id, name, team, kind: 'bot', alive: true, health: 100,
      weapon: weaponId, skill: CONFIG.bots.skillMin + rng() * (CONFIG.bots.skillMax - CONFIG.bots.skillMin),
      body, group, hitMeshes: meshes,
      state: 'advance', node: nav.nearestNode(spawn[0], spawn[1]), path: [], pathIdx: 0,
      target: null, lastSeen: null, seenAt: -10, reactionAt: 0,
      burstLeft: 0, burstPause: 0, fireCooldown: 0, thinkAt: rng() * 0.1,
      holdUntil: 0, strafeDir: 1, strafeAt: 0, fall: 0, deadAt: -10,
      site: team === 'ember' ? (rng() < 0.5 ? 'A' : 'B') : null,
      hasKit: team === 'ash' && id % 2 === 0,
      walkPhase: rng() * 6,
    };
    bots.push(bot);
    return bot;
  }
  function weaponForRound(round, team, index) {
    if (round <= 1) return index % 2 === 0 ? 'sidekick' : 'ratter';
    if (round <= 2) return index % 3 === 0 ? 'sidekick' : 'longarm';
    return index % 3 === 2 ? 'ratter' : 'longarm';
  }
  function spawnAll(round) {
    for (const bot of bots) scene.remove(bot.group);
    bots.length = 0;
    idCounter = 0;
    EMBER_NAMES.forEach((name, i) => makeBot('ember', name, SPAWNS.ember[i + 1] ?? SPAWNS.ember[0], weaponForRound(round, 'ember', i)));
    ASH_NAMES.forEach((name, i) => makeBot('ash', name, SPAWNS.ash[i], weaponForRound(round, 'ash', i)));
  }
  // Line of sight: a ray from the bot's eye to the target's chest; any world
  // geometry closer than the target means occluded. Bots never see through walls.
  function canSee(bot, tx, ty, tz) {
    const dx = tx - bot.body.position.x;
    const dz = tz - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > CONFIG.bots.visionRange) return false;
    const angle = Math.atan2(-dx, -dz);
    let diff = angle - bot.body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > (CONFIG.bots.visionCone / 2) * (Math.PI / 180) && dist > 3) return false;
    _eye.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
    _to.set(tx - _eye.x, ty - _eye.y, tz - _eye.z).normalize();
    _losRay.set(_eye, _to);
    _losRay.far = dist;
    return _losRay.intersectObjects(losTargets, false).length === 0;
  }
  function enemiesOf(bot) {
    const out = [];
    if (bot.team === 'ash' && state.player.alive) out.push({ kind: 'player', x: 0, z: 0, ref: state.player });
    for (const other of bots) {
      if (other.team !== bot.team && other.alive) out.push({ kind: 'bot', ref: other });
    }
    return out;
  }
  // The player's live position is read from the shared player body (main.js
  // passes it in through setPlayerBody).
  let playerBody = null;
  function perceive(bot, now) {
    let best = null;
    let bestD = Infinity;
    for (const e of enemiesOf(bot)) {
      let ex;
      let ez;
      let ey;
      if (e.kind === 'player') {
        if (!playerBody) continue;
        ex = playerBody.position.x; ez = playerBody.position.z; ey = playerBody.position.y + playerBody.eye;
      } else {
        ex = e.ref.body.position.x; ez = e.ref.body.position.z; ey = e.ref.body.position.y + e.ref.body.eye;
      }
      const d = flatDist(bot.body.position.x, bot.body.position.z, ex, ez);
      if (d < bestD && canSee(bot, ex, ey, ez)) { best = e; bestD = d; }
    }
    if (best) {
      const wasNew = !bot.target || bot.target.ref !== best.ref;
      bot.target = best;
      bot.lastSeen = { x: best.kind === 'player' ? playerBody.position.x : best.ref.body.position.x, z: best.kind === 'player' ? playerBody.position.z : best.ref.body.position.z, at: now };
      bot.seenAt = now;
      if (wasNew) bot.reactionAt = now + CONFIG.bots.reactionMin + rng() * (CONFIG.bots.reactionMax - CONFIG.bots.reactionMin) + bestD * 0.006;
      if (bot.state !== 'engage' && bot.state !== 'retreat') bot.state = 'engage';
    } else if (bot.target && now - bot.seenAt > 1.2) {
      bot.target = null;
      if (bot.state === 'engage') bot.state = bot.team === 'ember' ? 'advance' : 'hold';
    }
  }
  function hear(bot) {
    for (const ev of state.events) {
      const d = flatDist(bot.body.position.x, bot.body.position.z, ev.x, ev.z);
      const radius = ev.kind === 'shot' ? CONFIG.bots.hearShot : ev.kind === 'beep' ? CONFIG.bots.hearBeep : ev.kind === 'step' ? CONFIG.bots.hearStep : 12;
      if (d > radius) continue;
      if (ev.kind === 'beep' && bot.state !== 'retreat') {
        bot.state = 'retreat';
        bot.retreatAt = state.time + 1.2;
        const covers = nav.nodesWith('cover');
        bot.path = nav.path(bot.node, covers[Math.floor(rng() * covers.length)]);
        bot.pathIdx = 0;
      } else if (ev.kind === 'shot' && bot.state === 'hold') {
        bot.state = 'rotate';
        bot.path = nav.path(bot.node, nav.nodesWith('peek')[Math.floor(rng() * 3)]);
        bot.pathIdx = 0;
      }
    }
  }
  function routeTo(bot, nodeId) {
    bot.path = nav.path(bot.node, nodeId);
    bot.pathIdx = 0;
  }
  function followPath(bot, dt, speedMul = 1) {
    if (bot.pathIdx >= bot.path.length) return true;
    const node = nav.byId.get(bot.path[bot.pathIdx]);
    const dx = node.x - bot.body.position.x;
    const dz = node.z - bot.body.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) {
      bot.node = node.id;
      bot.pathIdx += 1;
      return bot.pathIdx >= bot.path.length;
    }
    const speed = CONFIG.player.walkSpeed * 0.82 * speedMul;
    moveBody(bot.body, colliders, dt, dx / d, dz / d, speed, false, false);
    bot.body.yaw = Math.atan2(-dx, -dz);
    return false;
  }
  // Burst fire at the current target with the bot's skill scalar. Damage is
  // resolved by main.js through the damage callback, so bots and the player
  // share one damage path.
  function tryFire(bot, now, damage, targets) {
    if (!bot.target || now < bot.reactionAt) return;
    if (bot.burstLeft <= 0) {
      if (bot.burstPause > now) return;
      bot.burstLeft = CONFIG.bots.burstMin + Math.floor(rng() * (CONFIG.bots.burstMax - CONFIG.bots.burstMin + 1));
      bot.burstPause = now + 0.55 + rng() * 0.5;
    }
    if (bot.fireCooldown > now) return;
    const w = CONFIG.weapons[bot.weapon];
    bot.fireCooldown = now + w.gap * (bot.weapon === 'doorstop' ? 1 : 1.15);
    bot.burstLeft -= 1;
    const t = bot.target;
    const tx = t.kind === 'player' ? playerBody.position.x : t.ref.body.position.x;
    const tz = t.kind === 'player' ? playerBody.position.z : t.ref.body.position.z;
    const ty = (t.kind === 'player' ? playerBody.position.y : t.ref.body.position.y) + 1.2;
    const ex = bot.body.position.x;
    const ez = bot.body.position.z;
    const ey = bot.body.position.y + bot.body.eye;
    const dist = flatDist(ex, ez, tx, tz);
    const aimYaw = Math.atan2(-(tx - ex), -(tz - ez));
    const aimPitch = Math.asin(Math.max(-1, Math.min(1, (ty - ey) / Math.max(1, dist))));
    const spread = (w.spreadStill + w.spreadMove * 0.4) * (1.6 - bot.skill * 0.6) * (1 + dist / 40);
    for (let p = 0; p < w.pellets; p += 1) {
      const res = shoot.fire(new THREE.Vector3(ex, ey, ez), aimYaw, aimPitch, spread, rng, targets);
      fx.tracer(new THREE.Vector3(ex, ey, ez), res.point);
      if (res.target && !res.blocked) {
        damage(res.target, shoot.damageFor(w, res.part, res.distance), bot);
      } else if (res.blocked) {
        fx.impact(res.point, 6);
      }
    }
  }
  function stepBot(bot, dt, now, damage, targets) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      if (now - bot.deadAt > 4) bot.group.visible = false;
      return;
    }
    bot.thinkAt -= dt;
    if (bot.thinkAt <= 0) {
      bot.thinkAt = 1 / CONFIG.bots.thinkHz;
      perceive(bot, now);
      hear(bot);
    }
    const bomb = state.bomb;
    // Objective overrides: carrier plants, defenders defuse, everyone rotates
    // to the planted site.
    if (bomb.planted && bot.team === 'ash' && bot.state !== 'defuse' && bot.state !== 'engage') {
      bot.state = 'rotate';
      routeTo(bot, nav.nearestNode(SITES[bomb.site].x, SITES[bomb.site].z));
    }
    if (bomb.planted && bot.team === 'ash' && flatDist(bot.body.position.x, bot.body.position.z, SITES[bomb.site].x, SITES[bomb.site].z) < 3 && !bomb.defusing) {
      bot.state = 'defuse';
    }
    if (!bomb.planted && bomb.carrier === bot.id && bot.state !== 'plant' && bot.state !== 'engage') {
      bot.state = 'plant';
      const site = bot.site ?? 'A';
      routeTo(bot, nav.nodesWith('plant').find((id) => {
        const n = nav.byId.get(id);
        return Math.abs(n.x - SITES[site].x) < 6 && Math.abs(n.z - SITES[site].z) < 6;
      }) ?? nav.nearestNode(SITES[site].x, SITES[site].z));
    }
    switch (bot.state) {
      case 'advance': {
        if (!bot.path.length) {
          const site = bot.team === 'ember' ? bot.site : null;
          const goal = bot.team === 'ember'
            ? nav.nearestNode(SITES[site].x, SITES[site].z)
            : pickHoldNode(nav, rng, rng() < 0.5 ? 'A' : 'B');
          routeTo(bot, goal);
        }
        if (followPath(bot, dt)) {
          bot.state = bot.team === 'ember' ? 'hold' : 'hold';
          bot.holdUntil = now + 3 + rng() * 4;
        }
        break;
      }
      case 'hold': {
        bot.body.yaw += Math.sin(now * 0.7 + bot.id) * dt * 0.25;
        if (bot.team === 'ember' && now > bot.holdUntil) {
          bot.state = 'advance';
          bot.path = [];
        }
        break;
      }
      case 'engage': {
        if (bot.target) {
          const tx = bot.target.kind === 'player' ? playerBody.position.x : bot.target.ref.body.position.x;
          const tz = bot.target.kind === 'player' ? playerBody.position.z : bot.target.ref.body.position.z;
          bot.body.yaw = Math.atan2(-(tx - bot.body.position.x), -(tz - bot.body.position.z));
          // Strafe between bursts so the bot is a moving target, not a turret.
          if (now > bot.strafeAt) {
            bot.strafeDir *= -1;
            bot.strafeAt = now + 0.7 + rng() * 0.8;
          }
          const sx = Math.cos(bot.body.yaw) * bot.strafeDir;
          const sz = -Math.sin(bot.body.yaw) * bot.strafeDir;
          moveBody(bot.body, colliders, dt, sx, sz, CONFIG.player.walkSpeed * 0.35, false, rng() < 0.3);
          tryFire(bot, now, damage, targets);
        }
        break;
      }
      case 'rotate': {
        if (followPath(bot, dt, 1.1)) bot.state = bomb.planted ? 'hold' : 'advance';
        break;
      }
      case 'retreat': {
        if (followPath(bot, dt, 1.15) || now > (bot.retreatAt ?? 0) + 2) {
          bot.state = bot.health < CONFIG.bots.retreatHp ? 'hold' : 'advance';
          bot.path = [];
        }
        break;
      }
      case 'plant':
      case 'defuse': {
        // objective.js drives the progress while the bot stands in the zone;
        // the bot itself just stays put and watches the lane.
        bot.body.yaw += Math.sin(now * 0.5 + bot.id * 2) * dt * 0.3;
        break;
      }
      default:
        break;
    }
    // Walk bob + mesh sync (render reads the body, never the other way round).
    bot.walkPhase += dt * (Math.hypot(bot.body.velocity.x, bot.body.velocity.z) > 0.5 ? 9 : 0);
    bot.group.position.set(bot.body.position.x, bot.body.position.y + Math.abs(Math.sin(bot.walkPhase)) * 0.03, bot.body.position.z);
    bot.group.rotation.y = bot.body.yaw;
  }
  return {
    bots,
    spawnAll,
    setPlayerBody(body) { playerBody = body; },
    step(dt, now, damage, targets) {
      for (const bot of bots) stepBot(bot, dt, now, damage, targets);
    },
    // A teammate's death within 12 m is a callout: nearby bots rotate toward
    // the killer's last known position.
    onTeammateDown(x, z, killerX, killerZ) {
      for (const bot of bots) {
        if (!bot.alive || flatDist(bot.body.position.x, bot.body.position.z, x, z) > 12) continue;
        if (bot.state === 'hold' || bot.state === 'advance') {
          bot.state = 'rotate';
          routeTo(bot, nav.nearestNode(killerX, killerZ));
        }
      }
    },
    resetRound(round) {
      spawnAll(round);
      for (const bot of bots) {
        // Both teams start by advancing: Ember routes to a site, Ash routes to
        // a hold node and then holds there ('advance' ends in 'hold' on arrival).
        bot.state = 'advance';
        bot.holdUntil = 0;
        if (bot.team === 'ash') {
          bot.site = null;
          routeTo(bot, pickHoldNode(nav, rng, rng() < 0.5 ? 'A' : 'B'));
        } else {
          bot.site = rng() < 0.5 ? 'A' : 'B';
          bot.path = [];
        }
      }
    },
    aliveCount(team) { return bots.filter((b) => b.team === team && b.alive).length; },
    carrierBot() { return bots.find((b) => b.alive && state.bomb.carrier === b.id) ?? null; },
  };
}
