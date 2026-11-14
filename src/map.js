// Kiln Yard — an original 44 x 32 m brickworks at dusk. Three lanes run from the
// Ember Gate (south, z=+16) to the Ash Yard (north, z=-16):
//   A-Long (west, x=-16) — a 30 m rifle sightline past a crate row, to Site A.
//   Mid Court (x=0) — a broken fountain and low walls, crossfire in the middle.
//   B-Alley (east, x=+16) — a dog-leg tunnel with a blind corner, to Site B.
// Every sightline longer than ~18 m is broken by cover; every site has two or
// more entries; each spawn has three exits, so there is no spawn camping.
// All geometry is AABBs (the same per-axis resolver moves player and bots);
// the whole yard is flat except the Loading Dock platform (0.55 m, jumpable).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures, createMaterials } from './textures.js';

export const SITES = {
  A: { x: -16, z: -10, r: 4.6 },
  B: { x: 16, z: -10, r: 4.6 },
};
export const SPAWNS = {
  ember: [[-4, 14], [0, 14.5], [4, 14], [-8, 13], [8, 13]],
  ash: [[-16, -13.5], [-4, -14], [4, -14], [16, -13.5], [0, -13]],
};

export function createMap(scene) {
  const textures = createTextures();
  const mat = createMaterials(textures);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  // Ground + perimeter walls (4.6 m). The yard is open to the dusk sky.
  box(44.4, 0.4, 32.4, 0, -0.2, 0, mat.concrete);
  box(0.4, 4.6, 32.4, -22.2, 2.3, 0, mat.brick);
  box(0.4, 4.6, 32.4, 22.2, 2.3, 0, mat.brick);
  box(44.4, 4.6, 0.4, 0, 2.3, -16.2, mat.brick);
  box(44.4, 4.6, 0.4, 0, 2.3, 16.2, mat.brick);
  // Site A — Kiln Hall: two kiln mouths (tall furnace blocks with glowing mouths).
  box(3.2, 4.2, 2.2, -19.5, 2.1, -12.5, mat.brick);
  box(3.2, 4.2, 2.2, -19.5, 2.1, -7.5, mat.brick);
  box(1.6, 1.4, 0.3, -17.8, 1.0, -12.5, mat.furnace, false);
  box(1.6, 1.4, 0.3, -17.8, 1.0, -7.5, mat.furnace, false);
  box(2.6, 1.1, 1.4, -13.5, 0.55, -12.8, mat.dark);
  box(1.4, 1.1, 2.6, -13.2, 0.55, -7.2, mat.dark);
  // Site B — Loading Dock: stacked crates + a raised 0.55 m dock platform.
  box(4.5, 0.55, 3.2, 19.2, 0.275, -10, mat.concrete);
  box(1.6, 1.2, 1.6, 17.5, 1.15, -12.2, mat.dark);
  box(1.6, 1.2, 1.6, 20.2, 1.15, -8.2, mat.dark);
  box(1.2, 2.4, 1.2, 20.6, 1.2, -12.6, mat.brick);
  box(2.2, 1.0, 1.2, 13.8, 0.5, -12.5, mat.dark);
  box(1.2, 1.0, 2.2, 13.8, 0.5, -7.6, mat.dark);
  // Mid Court: broken fountain + low walls (the crossfire).
  box(3.4, 0.9, 3.4, 0, 0.45, 0, mat.concrete);
  box(1.2, 1.3, 1.2, 0, 1.15, 0, mat.dark);
  box(3.0, 1.0, 0.6, -3.5, 0.5, 3.5, mat.brick);
  box(3.0, 1.0, 0.6, 3.5, 0.5, -3.5, mat.brick);
  // A-Long crate row (breaks the 30 m sightline) and A-Short connector.
  box(1.6, 1.3, 1.6, -16, 0.65, 2, mat.dark);
  box(1.6, 1.3, 1.6, -16, 0.65, -2, mat.dark);
  box(1.6, 2.6, 1.6, -14.2, 1.3, -5.5, mat.brick);
  box(2.4, 1.0, 1.2, -8.5, 0.5, -6, mat.dark);
  // B-Alley dog-leg: a tall corner block + crates, and B-Short connector.
  box(1.8, 3.4, 1.8, 14.5, 1.7, 2, mat.brick);
  box(1.6, 1.3, 1.6, 16, 0.65, 5.5, mat.dark);
  box(1.6, 1.3, 1.6, 18.5, 0.65, -2.5, mat.dark);
  box(2.4, 1.0, 1.2, 8.5, 0.5, -6, mat.dark);
  // Spawn cover + lane pillars so no spawn-to-spawn pixel angle exists.
  box(2.0, 1.2, 1.0, -6, 0.6, 10, mat.dark);
  box(2.0, 1.2, 1.0, 6, 0.6, 10, mat.dark);
  box(1.2, 3.0, 1.2, -8, 1.5, -10, mat.brick);
  box(1.2, 3.0, 1.2, 8, 1.5, -10, mat.brick);
  box(1.0, 2.6, 1.0, -2, 1.3, 8, mat.brick);
  box(1.0, 2.6, 1.0, 2, 1.3, -8, mat.brick);
  // Team trim: Ember orange gate south, Ash slate-blue yard north.
  box(6.0, 0.25, 0.25, 0, 0.13, 15.9, mat.ember, false);
  box(6.0, 0.25, 0.25, 0, 0.13, -15.9, mat.ashTrim, false);
  // Site decals + hazard borders painted on the ground.
  function decal(tex, x, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4), tex);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    group.add(m);
  }
  decal(mat.decalA, SITES.A.x, SITES.A.z);
  decal(mat.decalB, SITES.B.x, SITES.B.z);
  box(9.0, 0.06, 0.5, SITES.A.x, 0.03, SITES.A.z - 4.6, mat.hazard, false);
  box(9.0, 0.06, 0.5, SITES.B.x, 0.03, SITES.B.z - 4.6, mat.hazard, false);

  // Lighting: low warm dusk sun with soft shadows, sky/ground hemisphere,
  // two furnace point lights at A and one cool dock lamp at B, plus a fill.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a6a4a'), new THREE.Color(PALETTE.canvas), 0.9);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.4);
  sun.position.set(14, 18, 10);
  sun.target.position.set(-4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-10, 9, 12);
  scene.add(fill);
  const furnaceLight = new THREE.PointLight(new THREE.Color(PALETTE.furnace), 26, 16, 1.8);
  furnaceLight.position.set(-17.5, 1.6, -10);
  scene.add(furnaceLight);
  const dockLight = new THREE.PointLight(new THREE.Color('#cfe0ee'), 14, 14, 1.8);
  dockLight.position.set(16, 3.4, -10);
  scene.add(dockLight);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 25, 70);
  return { colliders, shootables, group, furnaceLight, dockLight };
}
