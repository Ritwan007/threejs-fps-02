// Player movement — and the one movement implementation bots share. A body is
// a plain object {position, velocity, yaw, pitch, eye, height, onGround,
// crouching}; moveBody() accelerates it toward a wish direction, applies
// friction/gravity/jump, and resolves it as a box against the world colliders
// one axis at a time, so a wall never swallows a body.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const P = CONFIG.player;
const _probe = new THREE.Box3();

export function makeBody(x, z, yaw = 0) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw, pitch: 0, eye: P.eyeStand, height: P.heightStand,
    onGround: true, crouching: false,
  };
}

function overlaps(colliders, x, y, z, height, lift) {
  _probe.min.set(x - P.radius, y + lift, z - P.radius);
  _probe.max.set(x + P.radius, y + height - lift, z + P.radius);
  for (const c of colliders) if (_probe.intersectsBox(c)) return c;
  return null;
}

export function moveBody(body, colliders, dt, wishX, wishZ, speed, wantJump, wantCrouch) {
  if (wantCrouch && !body.crouching) {
    body.crouching = true;
    body.height = P.heightCrouch;
  } else if (!wantCrouch && body.crouching && !overlaps(colliders, body.position.x, body.position.y, body.position.z, P.heightStand, 0.02)) {
    body.crouching = false;
    body.height = P.heightStand;
  }
  const eyeTarget = body.crouching ? P.eyeCrouch : P.eyeStand;
  body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);
  const blend = Math.min(1, (body.onGround ? P.accel : 9) * dt / Math.max(0.1, speed));
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - P.friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }
  if (wantJump && body.onGround) {
    body.velocity.y = P.jump;
    body.onGround = false;
  }
  body.velocity.y -= P.gravity * dt;
  const nx = body.position.x + body.velocity.x * dt;
  if (!overlaps(colliders, nx, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nx;
  else body.velocity.x = 0;
  const nz = body.position.z + body.velocity.z * dt;
  if (!overlaps(colliders, body.position.x, body.position.y, nz, body.height, 0.04)) body.position.z = nz;
  else body.velocity.z = 0;
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(colliders, body.position.x, body.position.y, body.position.z, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

export function createPlayer(colliders) {
  const body = makeBody(0, 14.5, Math.PI);
  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }
  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }
  function step(dt, keys) {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(body.yaw);
    const cos = Math.cos(body.yaw);
    let wx = 0;
    let wz = 0;
    if (forward || strafe) {
      const len = Math.hypot(-sin * forward + cos * strafe, -cos * forward - sin * strafe);
      wx = (-sin * forward + cos * strafe) / len;
      wz = (-cos * forward - sin * strafe) / len;
    }
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    moveBody(body, colliders, dt, wx, wz, body.crouching ? P.crouchSpeed : P.walkSpeed, keys.has('Space'), crouch);
  }
  return {
    body,
    step,
    look,
    recoil,
    groundSpeed() { return Math.hypot(body.velocity.x, body.velocity.z); },
  };
}
