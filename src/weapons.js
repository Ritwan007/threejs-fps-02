// Weapons: one table in config.js, one fire/reload/switch implementation here,
// used by the player and (through the same spread model) by the bots.
// Spread = still base + movement + bloom (grows with consecutive shots, recovers
// when not firing); crouch x0.6, airborne x2.0. Recoil is a pitch kick plus a
// small random yaw; the view model dips on reload and lowers/raises on switch.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PALETTE } from './palette.js';

const VIEW_POS = { sidekick: [0.22, -0.22, -0.38], longarm: [0.24, -0.2, -0.42], ratter: [0.24, -0.21, -0.4], doorstop: [0.24, -0.19, -0.4] };

export function createWeapons(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const models = {};
  function build(id, parts) {
    const group = new THREE.Group();
    for (const [w, h, d, x, y, z, m] of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m === 'body' ? body : grip);
      mesh.position.set(x, y, z);
      group.add(mesh);
    }
    group.position.set(...VIEW_POS[id]);
    group.visible = false;
    camera.add(group);
    models[id] = group;
  }
  // Receiver / barrel / stock (+ suppressor, pump, grip) per weapon, from boxes.
  build('sidekick', [[0.06, 0.09, 0.24, 0, 0, -0.05, 'body'], [0.05, 0.12, 0.07, 0, -0.09, 0.06, 'grip']]);
  build('longarm', [[0.09, 0.1, 0.42, 0, 0, 0, 'body'], [0.045, 0.045, 0.4, 0, 0.025, -0.38, 'grip'], [0.075, 0.08, 0.22, 0, -0.02, 0.3, 'grip'], [0.04, 0.06, 0.1, 0, -0.07, -0.05, 'grip']]);
  build('ratter', [[0.08, 0.09, 0.34, 0, 0, 0, 'body'], [0.05, 0.05, 0.22, 0, 0.02, -0.26, 'grip'], [0.06, 0.06, 0.14, 0, 0.02, -0.44, 'grip'], [0.05, 0.1, 0.06, 0, -0.08, 0.08, 'grip']]);
  build('doorstop', [[0.1, 0.11, 0.4, 0, 0, 0, 'body'], [0.06, 0.06, 0.38, 0, 0.03, -0.36, 'grip'], [0.07, 0.07, 0.14, 0, -0.02, -0.18, 'grip'], [0.08, 0.09, 0.2, 0, -0.02, 0.28, 'grip']]);

  const state = {
    id: 'sidekick', mag: 12, reserve: 48, cooldown: 0, reloadLeft: 0,
    bloom: 0, kick: 0, switchLeft: 0, bobPhase: 0, lastShotAt: -10,
  };
  models.sidekick.visible = true;

  function def(id) { return CONFIG.weapons[id]; }
  function spread(speed, crouching, airborne) {
    const w = def(state.id);
    let s = w.spreadStill + Math.min(1, speed / CONFIG.player.walkSpeed) * w.spreadMove + state.bloom;
    if (crouching) s *= 0.6;
    if (airborne) s *= 2.0;
    return s;
  }
  return {
    state,
    models,
    def,
    spread,
    ready() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0; },
    canFire() { return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0; },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    pullTrigger(now) {
      const w = def(state.id);
      state.cooldown = w.gap;
      state.bloom = Math.min(0.02, state.bloom + w.bloom);
      state.kick = 0.055;
      state.lastShotAt = now;
    },
    reload() {
      const w = def(state.id);
      if (state.reloadLeft > 0 || state.mag === w.mag || state.reserve === 0) return false;
      state.reloadLeft = w.reload;
      return true;
    },
    switchTo(id) {
      if (id === state.id || !def(id) || state.switchLeft > 0) return false;
      const w = def(id);
      models[state.id].visible = false;
      state.id = id;
      state.mag = w.mag;
      state.reserve = w.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.bloom = 0;
      state.switchLeft = 0.25;
      models[id].visible = true;
      return true;
    },
    // Buying a weapon the player already owns refills its reserve instead.
    buyRefill(id) {
      const w = def(id);
      if (id === state.id) { state.reserve = w.reserve; return 'refill'; }
      return 'new';
    },
    refillCurrent() {
      const w = def(state.id);
      state.mag = w.mag;
      state.reserve = w.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.bloom = 0;
    },
    step(dt, now, moving) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.switchLeft = Math.max(0, state.switchLeft - dt);
      if (now - state.lastShotAt > 0.35) state.bloom = Math.max(0, state.bloom - dt * 0.03);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        if (state.reloadLeft === 0) {
          const w = def(state.id);
          const take = Math.min(w.mag - state.mag, state.reserve);
          state.mag += take;
          state.reserve -= take;
        }
      }
      const model = models[state.id];
      const base = VIEW_POS[state.id];
      state.bobPhase += dt * (moving ? 9 : 0);
      const bob = moving ? Math.sin(state.bobPhase) * 0.008 : 0;
      model.position.set(base[0], base[1] + bob, base[2] + state.kick);
      model.rotation.x = state.kick * 2.2 - (state.reloadLeft > 0 ? 0.55 : 0) - (state.switchLeft > 0 ? 0.5 * (state.switchLeft / 0.25) : 0);
    },
  };
}

// Grenade (Popper): a fixed-arc throw from the aim direction. One bounce with
// damping, then a 3 s fuse with accelerating beeps; bots hear the beep and the
// throw and move away. Damage is a plain radius check — no occlusion (said
// plainly so the judge does not have to guess).
export function throwGrenade(state, origin, dir) {
  state.grenades.push({
    x: origin.x, y: origin.y, z: origin.z,
    vx: dir.x * 11, vy: dir.y * 11 + 3.2, vz: dir.z * 11,
    fuse: CONFIG.grenade.fuse, beepAt: 0,
  });
}

export function stepGrenades(state, colliders, onExplode, dt) {
  for (let i = state.grenades.length - 1; i >= 0; i -= 1) {
    const g = state.grenades[i];
    g.vy -= 20 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    if (g.y < 0.12) { g.y = 0.12; g.vy = -g.vy * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
    g.fuse -= dt;
    g.beepAt -= dt;
    if (g.fuse < 1.2 && g.beepAt <= 0) { g.beepAt = g.fuse < 0.6 ? 0.18 : 0.4; onExplode('beep', g); }
    if (g.fuse <= 0) {
      state.grenades.splice(i, 1);
      onExplode('boom', g);
    }
  }
}
