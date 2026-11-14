// All art is procedural: four 256x256 canvases painted once at boot, zero asset
// files, zero network. Brick (walls), concrete (ground), hazard stripes (site
// borders and the dock edge) and big "A"/"B" floor decals that mark the sites
// so the yard reads at a glance.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvasTexture(size, paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

export function createTextures() {
  const brick = canvasTexture(256, (g, s) => {
    g.fillStyle = PALETTE.surface;
    g.fillRect(0, 0, s, s);
    const rows = 8;
    for (let r = 0; r < rows; r += 1) {
      const h = s / rows;
      const off = (r % 2) * 32;
      for (let c = -1; c < 5; c += 1) {
        const shade = 26 + ((r * 5 + c) % 3) * 7;
        g.fillStyle = `rgb(${shade + 14},${shade - 2},${shade - 8})`;
        g.fillRect(c * 64 + off + 2, r * h + 2, 60, h - 4);
      }
    }
    g.fillStyle = PALETTE.hairline;
    for (let r = 0; r <= rows; r += 1) g.fillRect(0, r * (s / rows) - 1, s, 2);
  }, 6, 2);
  const concrete = canvasTexture(256, (g, s) => {
    g.fillStyle = '#2a211a';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i += 1) {
      const v = 30 + ((i * 37) % 25);
      g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
      g.fillRect((i * 53) % s, (i * 91) % s, 3, 3);
    }
    g.strokeStyle = PALETTE.hairline;
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(s, i * 64); g.stroke();
    }
  }, 10, 8);
  const hazard = canvasTexture(256, (g, s) => {
    g.fillStyle = '#241c16';
    g.fillRect(0, 0, s, s);
    g.fillStyle = PALETTE.accent;
    for (let i = -4; i < 8; i += 1) {
      g.beginPath();
      g.moveTo(i * 48, s); g.lineTo(i * 48 + 48, 0); g.lineTo(i * 48 + 72, 0); g.lineTo(i * 48 + 24, s);
      g.closePath(); g.fill();
    }
  }, 4, 1);
  function siteLetter(letter) {
    return canvasTexture(256, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = 'rgba(255,140,46,0.92)';
      g.font = 'bold 190px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(letter, s / 2, s / 2 + 8);
      g.strokeStyle = 'rgba(255,140,46,0.9)';
      g.lineWidth = 6;
      g.strokeRect(10, 10, s - 20, s - 20);
    });
  }
  return { brick, concrete, hazard, siteA: siteLetter('A'), siteB: siteLetter('B') };
}

// One shared standard material per surface type, built from the canvases.
export function createMaterials(textures) {
  const std = (map, rough = 0.92, metal = 0.05, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal, ...extra });
  return {
    brick: std(textures.brick, 0.92, 0.04),
    concrete: std(textures.concrete, 0.95, 0.02),
    hazard: std(textures.hazard, 0.85, 0.05),
    dark: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.9, metalness: 0.08 }),
    metal: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b5a48'), roughness: 0.45, metalness: 0.55 }),
    ember: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25 }),
    ashTrim: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ash), roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(PALETTE.ash), emissiveIntensity: 0.25 }),
    furnace: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.furnace), roughness: 0.4, metalness: 0.1, emissive: new THREE.Color(PALETTE.furnace), emissiveIntensity: 1.6 }),
    decalA: new THREE.MeshBasicMaterial({ map: textures.siteA, transparent: true, depthWrite: false }),
    decalB: new THREE.MeshBasicMaterial({ map: textures.siteB, transparent: true, depthWrite: false }),
  };
}
