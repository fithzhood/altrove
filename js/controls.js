/* Altrove - controls.js
 * Camera in prima persona: mouse per guardare, WASD per muoversi.
 *
 * Due modalita. A piedi c e gravita, il passo segue il terreno, e la camera
 * ondeggia leggermente perche una testa che cammina non sta ferma. In volo si
 * disattiva tutto e si vola libero, comodo per guardare il posto dall alto.
 */

import * as THREE from '../vendor/three.module.js';

const PI2 = Math.PI / 2;

export class FirstPersonControls {
  constructor(camera, domElement, world) {
    this.camera = camera;
    this.dom = domElement;
    this.world = world;

    this.enabled = false;
    this.locked = false;

    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.0022;
    this.invertY = false;

    this.pos = new THREE.Vector3(0, 10, 0);
    this.vel = new THREE.Vector3();
    this.eyeHeight = 1.68;
    this.crouchHeight = 1.05;
    this.currentEye = this.eyeHeight;

    this.fly = false;
    this.walkSpeed = 4.2;
    this.runMul = 3.0;
    this.crouchMul = 0.42;
    this.flySpeed = 16;
    this.gravity = 22;
    this.jumpSpeed = 6.4;
    this.onGround = false;
    this.grounded = 0;

    this.bobPhase = 0;
    this.bobAmount = 0;
    this.stepDistance = 0;
    this.onStep = null;

    this.keys = Object.create(null);
    this.speedScale = 1;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Space' && !this.fly) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      this.yaw -= mx * this.sensitivity;
      this.pitch -= (this.invertY ? -my : my) * this.sensitivity;
      this.pitch = Math.max(-PI2 + 0.001, Math.min(PI2 - 0.001, this.pitch));
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.onLockChange) this.onLockChange(this.locked);
      if (!this.locked) this.keys = Object.create(null);
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  requestLock() {
    if (this.dom.requestPointerLock) this.dom.requestPointerLock();
  }
  releaseLock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  setWorld(world) { this.world = world; }

  teleport(x, z, extraY = 0) {
    const h = this.world ? this.world.height(x, z) : 0;
    this.pos.set(x, h + this.eyeHeight + extraY, z);
    this.vel.set(0, 0, 0);
    this.onGround = true;
  }

  groundHeight(x, z) {
    return this.world ? this.world.height(x, z) : 0;
  }

  update(dt) {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.06);

    const k = this.keys;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const str = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const run = !!(k.ShiftLeft || k.ShiftRight);
    const crouch = !!(k.ControlLeft || k.ControlRight || k.KeyC);

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // avanti nel piano orizzontale (yaw = 0 guarda verso -Z)
    const fx = -sy, fz = -cy;
    const rx = cy, rz = -sy;

    let wishX = fx * fwd + rx * str;
    let wishZ = fz * fwd + rz * str;
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 1e-4) { wishX /= wl; wishZ /= wl; }

    if (this.fly) {
      let speed = this.flySpeed * this.speedScale * (run ? 3.2 : 1) * (crouch ? 0.3 : 1);
      const up = (k.Space ? 1 : 0) - (k.ShiftRight ? 0 : 0) - (crouch ? 1 : 0);
      // in volo si guarda dove si punta: usa anche il pitch
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const dirX = fx * cp, dirY = sp, dirZ = fz * cp;
      const vx = dirX * fwd + rx * str;
      const vy = dirY * fwd + up;
      const vz = dirZ * fwd + rz * str;
      const l = Math.hypot(vx, vy, vz);
      if (l > 1e-4) {
        this.pos.x += vx / l * speed * dt;
        this.pos.y += vy / l * speed * dt;
        this.pos.z += vz / l * speed * dt;
      }
      this.vel.set(0, 0, 0);
      this.bobAmount *= Math.exp(-dt * 8);
    } else {
      const speed = this.walkSpeed * this.speedScale * (run ? this.runMul : 1) * (crouch ? this.crouchMul : 1);
      // accelerazione: niente scatti istantanei
      const accel = this.onGround ? 42 : 9;
      const tx = wishX * speed, tz = wishZ * speed;
      const a = 1 - Math.exp(-accel * dt);
      this.vel.x += (tx - this.vel.x) * a;
      this.vel.z += (tz - this.vel.z) * a;

      this.vel.y -= this.gravity * dt;
      if (k.Space && this.grounded > 0) {
        this.vel.y = this.jumpSpeed;
        this.grounded = 0;
        this.onGround = false;
      }

      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vel.y * dt;

      const eyeTarget = crouch ? this.crouchHeight : this.eyeHeight;
      this.currentEye += (eyeTarget - this.currentEye) * (1 - Math.exp(-12 * dt));

      const gh = this.groundHeight(this.pos.x, this.pos.z);
      const floor = gh + this.currentEye;
      if (this.pos.y <= floor) {
        /* Salita morbida: senza, ogni sassolino del terreno diventa uno scalino
         * e la camera sobbalza. */
        const diff = floor - this.pos.y;
        if (diff > 0.6 && this.vel.y < -1) {
          this.pos.y = floor;
        } else {
          this.pos.y += diff * (1 - Math.exp(-26 * dt));
          if (Math.abs(floor - this.pos.y) < 0.02) this.pos.y = floor;
        }
        if (this.vel.y < 0) this.vel.y = 0;
        this.onGround = true;
        this.grounded = 0.12;
      } else {
        this.onGround = false;
        this.grounded = Math.max(0, this.grounded - dt);
      }

      // oscillazione del passo
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (this.onGround && hs > 0.4) {
        const prev = this.bobPhase;
        this.bobPhase += hs * dt * 2.05;
        this.bobAmount += (Math.min(hs / this.walkSpeed, 1.6) - this.bobAmount) * (1 - Math.exp(-6 * dt));
        this.stepDistance += hs * dt;
        if (Math.floor(this.bobPhase / Math.PI) !== Math.floor(prev / Math.PI) && this.onStep) {
          this.onStep(this.pos, hs);
        }
      } else {
        this.bobAmount *= Math.exp(-dt * 6);
      }
    }

    // applica alla camera
    const bobY = Math.sin(this.bobPhase * 2) * 0.038 * this.bobAmount;
    const bobX = Math.sin(this.bobPhase) * 0.030 * this.bobAmount;
    const roll = Math.sin(this.bobPhase) * 0.0075 * this.bobAmount;

    this.camera.position.set(
      this.pos.x + Math.cos(this.yaw) * bobX,
      this.pos.y + bobY,
      this.pos.z - Math.sin(this.yaw) * bobX
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(roll);
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
