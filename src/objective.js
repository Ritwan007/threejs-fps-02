// The Kiln Charge — the objective beyond killing. The player spawns carrying
// it; hold E inside Site A or B for 3.5 s to plant (moving does not cancel,
// leaving the zone does). A planted charge runs a 35 s fuse; an enemy bot
// holds the zone for 5 s (2.5 s with a kit) to defuse. If the player dies
// carrying it, the nearest living friendly bot picks it up and routes to the
// nearest site to plant. Detonation ends the round for Ember.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SITES } from './map.js';
import { flatDist } from './util.js';

export function createObjective(scene, state) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff8c2e'), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color('#ff5a1f'), emissiveIntensity: 0.9 });
  const charge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24), mat);
  const blink = new THREE.PointLight(new THREE.Color('#ff5a1f'), 0, 8);
  scene.add(charge, blink);
  let beepAt = 0;
  function siteOf(x, z) {
    for (const [letter, s] of Object.entries(SITES)) {
      if (flatDist(x, z, s.x, s.z) < s.r) return letter;
    }
    return null;
  }
  function handOffCarrier() {
    // Player died carrying the charge: nearest living friendly bot takes it.
    let best = null;
    let bestD = Infinity;
    for (const bot of state._bots ?? []) {
      if (bot.team !== 'ember' || !bot.alive) continue;
      const d = flatDist(bot.body.position.x, bot.body.position.z, state.bomb.x, state.bomb.z);
      if (d < bestD) { bestD = d; best = bot; }
    }
    if (best) {
      state.bomb.carrier = best.id;
      best.site = flatDist(best.body.position.x, best.body.position.z, SITES.A.x, SITES.A.z) < flatDist(best.body.position.x, best.body.position.z, SITES.B.x, SITES.B.z) ? 'A' : 'B';
      best.state = 'plant';
    } else {
      state.bomb.carrier = null;
    }
  }
  return {
    charge,
    siteOf,
    handOffCarrier,
    // Called every fixed step during live play. `actor` is {x, z, holdingE,
    // isPlayer} for the planter/defuser the caller resolved; returns an event
    // string ('planted' | 'detonated' | 'defused' | null) for rounds.js.
    step(dt, actor, playerBody, audio) {
      const bomb = state.bomb;
      if (bomb.planted) {
        bomb.fuse -= dt;
        const blinkOn = bomb.fuse < 10 ? Math.sin(state.time * 12) > 0 : Math.sin(state.time * 4) > 0;
        blink.intensity = blinkOn ? 14 : 0;
        if (bomb.fuse < 10) {
          beepAt -= dt;
          if (beepAt <= 0) { beepAt = bomb.fuse < 5 ? 0.35 : 0.8; audio.beep(true); }
        }
        // Defuse: whoever is standing in the planted site holding E.
        const defuser = actor?.defusing;
        if (defuser) {
          const need = defuser.hasKit ? CONFIG.match.defuseKitSeconds : CONFIG.match.defuseSeconds;
          bomb.defuseProgress += dt / need;
          if (Math.floor(bomb.defuseProgress * 8) !== Math.floor((bomb.defuseProgress - dt / need) * 8)) audio.plantTick();
          if (bomb.defuseProgress >= 1) {
            bomb.planted = false;
            bomb.defusing = null;
            return 'defused';
          }
        } else {
          bomb.defuseProgress = 0;
        }
        if (bomb.fuse <= 0) return 'detonated';
        return null;
      }
      // Planting: the carrier stands in a site holding E.
      const planter = actor?.planting;
      if (planter && bomb.carrier !== null) {
        const site = siteOf(planter.x, planter.z);
        if (site) {
          bomb.site = site;
          bomb.plantProgress += dt / CONFIG.match.plantSeconds;
          if (Math.floor(bomb.plantProgress * 6) !== Math.floor((bomb.plantProgress - dt / CONFIG.match.plantSeconds) * 6)) audio.plantTick();
          if (bomb.plantProgress >= 1) {
            bomb.planted = true;
            bomb.fuse = CONFIG.match.fuseSeconds;
            bomb.plantProgress = 0;
            bomb.x = planter.x;
            bomb.z = planter.z;
            return 'planted';
          }
        } else {
          bomb.plantProgress = 0;
        }
      } else {
        bomb.plantProgress = 0;
      }
      return null;
    },
    syncVisual(playerBody) {
      const bomb = state.bomb;
      if (bomb.planted) {
        charge.position.set(bomb.x, 0.35, bomb.z);
        blink.position.set(bomb.x, 0.8, bomb.z);
        charge.visible = true;
      } else if (bomb.carrier === 'player' && state.player.alive) {
        charge.visible = false;
        blink.intensity = 0;
      } else {
        const carrier = (state._bots ?? []).find((b) => b.id === bomb.carrier);
        if (carrier && carrier.alive) {
          charge.position.set(carrier.body.position.x, carrier.body.position.y + 1.0, carrier.body.position.z);
          charge.visible = true;
        } else {
          charge.visible = false;
        }
        blink.intensity = 0;
      }
    },
  };
}
