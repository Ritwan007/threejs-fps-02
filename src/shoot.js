// Hitscan shooting: one ray, one damage function, used by the player and every
// bot. Hits are checked against bodies — head / torso / legs are tagged parts
// (userData.part), and damage is head-multiplied (HEAD_MULT in config.js),
// falloff-scaled past the weapon's range, and reduced on legs. A shot that
// hits world geometry stops there and sparks; a miss draws a tracer to its end.
import * as THREE from 'three';

const _raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

export function createShoot() {
  _raycaster.far = 90;
  // Fire one hitscan pellet. Returns {point, target, part, distance, blocked}
  // or null when nothing was hit (tracer runs to max range).
  function fire(origin, yaw, pitch, spread, rng, targets) {
    _dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    _dir.x += (rng() * 2 - 1) * spread;
    _dir.y += (rng() * 2 - 1) * spread;
    _dir.z += (rng() * 2 - 1) * spread;
    _dir.normalize();
    _origin.copy(origin);
    _raycaster.set(_origin, _dir);
    const hits = _raycaster.intersectObjects(targets, false);
    if (!hits.length) {
      const end = _origin.clone().addScaledVector(_dir, 60);
      return { point: end, target: null, part: null, distance: 60, blocked: false };
    }
    const hit = hits[0];
    return {
      point: hit.point,
      target: hit.object.userData.target ?? null,
      part: hit.object.userData.part ?? null,
      distance: hit.distance,
      blocked: !hit.object.userData.target,
    };
  }
  // Damage for one pellet that connected: head xHEAD_MULT, legs x0.75, and
  // falloff past range down to a 0.4 floor so long shots still sting.
  function damageFor(weapon, part, distance) {
    let dmg = weapon.damage;
    if (part === 'head') dmg *= weapon.headMult;
    else if (part === 'legs') dmg *= 0.75;
    if (distance > weapon.range) dmg *= Math.max(0.4, 1 - (distance - weapon.range) / weapon.range);
    return Math.round(dmg);
  }
  return { fire, damageFor };
}

// A body's hit meshes: torso box, head sphere, legs box. Every mesh carries
// userData {target: <owner record>, part} so one raycast resolves the hit.
export function makeHitMeshes(owner, teamColor) {
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.05 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f2ead9'), roughness: 0.5, metalness: 0.05 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#241c16'), roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), torsoMat);
  torso.position.y = 1.0;
  torso.userData = { target: owner, part: 'torso' };
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), headMat);
  head.position.y = 1.53;
  head.userData = { target: owner, part: 'head' };
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.26), legMat);
  legs.position.y = 0.32;
  legs.userData = { target: owner, part: 'legs' };
  return [torso, head, legs];
}
