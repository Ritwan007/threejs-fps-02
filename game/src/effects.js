// Pooled effects: no `new` in hot loops. 24 pre-allocated tracer lines, one
// pre-allocated spark Points cloud (240 points), one muzzle flash + light,
// one explosion flash + ring, one smoke puff. Screen shake is a decaying
// camera offset. Everything is allocated once in createEffects().
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 240;

export function createEffects(scene, camera) {
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.07, transparent: true, opacity: 0.95 }));
  sparks.visible = false;
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARKS * 3);
  let sparkLife = 0;
  let sparkCount = 0;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);
  let flashLife = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.furnace), transparent: true, opacity: 0.85, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.furnace), 0, 30);
  scene.add(boomLight);
  let boomLife = 0;

  let shake = 0;
  return {
    tracer(from, to) {
      const t = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACERS;
      const p = t.line.geometry.attributes.position.array;
      p[0] = from.x; p[1] = from.y; p[2] = from.z;
      p[3] = to.x; p[4] = to.y; p[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.visible = true;
      t.life = 0.07;
    },
    impact(point, n = 10) {
      sparkCount = Math.min(SPARKS, n);
      for (let i = 0; i < sparkCount; i += 1) {
        sparkPos[i * 3] = point.x; sparkPos[i * 3 + 1] = point.y; sparkPos[i * 3 + 2] = point.z;
        sparkVel[i * 3] = (Math.random() - 0.5) * 4;
        sparkVel[i * 3 + 1] = Math.random() * 3;
        sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 4;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparks.visible = true;
      sparkLife = 0.3;
    },
    muzzle() { flash.visible = true; flashLife = 0.06; flashLight.intensity = 18; },
    explosion(point) {
      boom.position.copy(point);
      boom.visible = true;
      boomLife = 0.7;
      boomLight.position.copy(point);
      boomLight.intensity = 120;
      shake = 0.5;
    },
    addShake(amount) { shake = Math.min(0.6, shake + amount); },
    shakeOffset() { return shake; },
    step(dt) {
      for (const t of tracers) {
        if (!t.line.visible) continue;
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
      }
      if (flashLife > 0) {
        flashLife -= dt;
        flash.rotation.z = flashLife * 40;
        if (flashLife <= 0) { flash.visible = false; flashLight.intensity = 0; }
      }
      if (sparkLife > 0) {
        sparkLife -= dt;
        for (let i = 0; i < sparkCount; i += 1) {
          sparkPos[i * 3] += sparkVel[i * 3] * dt;
          sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
          sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
          sparkVel[i * 3 + 1] -= 9 * dt;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        if (sparkLife <= 0) sparks.visible = false;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - boomLife / 0.7;
        boom.scale.setScalar(1 + k * 7);
        boom.material.opacity = 0.85 * (1 - k);
        boomLight.intensity = 120 * (1 - k);
        if (boomLife <= 0) { boom.visible = false; boomLight.intensity = 0; }
      }
      shake = Math.max(0, shake - dt * 1.4);
    },
  };
}
