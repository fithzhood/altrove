/* Altrove - controls.js
 * Camera in prima persona: mouse per guardare, WASD per muoversi.
 *
 * Due modalita. A piedi c e gravita, il passo segue il terreno, e la camera
 * ondeggia leggermente perche una testa che cammina non sta ferma. In volo si
 * disattiva tutto e si vola libero, comodo per guardare il posto dall alto.
 *
 * Si gioca anche col joystick. Le due leve non sono la stessa cosa del mouse e
 * della tastiera e non vanno trattate come tali: la leva sinistra e analogica,
 * quindi porta con se la propria intensita (spingerla a meta vuol dire
 * camminare piano, e quel dato va conservato invece di schiacciarlo a 1); la
 * leva destra da una velocita di rotazione, non uno spostamento, quindi va
 * moltiplicata per il tempo trascorso o la mira cambierebbe con i fotogrammi
 * al secondo. Il joystick inoltre non ha bisogno del puntatore agganciato:
 * funziona anche fuori dal blocco del mouse, ed e giusto cosi.
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

    /* Joystick. padLook e in radianti al secondo a fondo corsa. La zona morta
     * e radiale, non per asse: presa asse per asse i diagonali resterebbero
     * bloccati piu a lungo dei cardinali, e la mira sembrerebbe incollata agli
     * angoli. */
    this.pad = null;
    this.padIndex = -1;
    this.padLookSpeed = 2.7;
    this.padDeadzone = 0.16;
    this.padInvertY = false;
    this.onPadPress = null;
    this.onPadConnect = null;
    this._padMove = { x: 0, y: 0 };
    this._padLook = { x: 0, y: 0 };
    this._padRun = false;
    this._padCrouch = false;
    this._padJump = false;
    this._padPrev = [];
    this._navDir = '';
    this._navTimer = 0;

    this._onPadConnect = (e) => {
      this.padIndex = e.gamepad.index;
      if (this.onPadConnect) this.onPadConnect(e.gamepad.id, true);
    };
    this._onPadDisconnect = (e) => {
      if (e.gamepad.index === this.padIndex) this.padIndex = -1;
      if (this.onPadConnect) this.onPadConnect(e.gamepad.id, false);
    };

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
    window.addEventListener('gamepadconnected', this._onPadConnect);
    window.addEventListener('gamepaddisconnected', this._onPadDisconnect);
  }

  requestLock() {
    if (this.dom.requestPointerLock) this.dom.requestPointerLock();
  }
  releaseLock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  setWorld(world) { this.world = world; }

  /* Nomi dei tasti nella disposizione «standard» (Xbox / DualShock / la
   * maggior parte dei cloni). Chi non la dichiara di solito la rispetta lo
   * stesso sugli indici bassi, quindi si prova comunque. */
  static get PAD_BUTTONS() {
    return {
      0: 'conferma', 1: 'annulla', 2: 'foto', 3: 'volo',
      4: 'meteoGiu', 5: 'meteoSu', 6: 'oraGiu', 7: 'oraSu',
      8: 'scatto', 9: 'pannello',
      12: 'su', 13: 'giu', 14: 'sinistra', 15: 'destra'
    };
  }

  /* Zona morta radiale con riscalatura: senza la riscalatura, appena si supera
   * la soglia la leva parte gia a 0,16 e si sente uno scatto. */
  _stick(ax, ay) {
    const m = Math.hypot(ax, ay);
    if (m < this.padDeadzone) return { x: 0, y: 0, m: 0 };
    const t = Math.min(1, (m - this.padDeadzone) / (1 - this.padDeadzone));
    return { x: ax / m * t, y: ay / m * t, m: t };
  }

  /* Va chiamato ogni fotogramma, anche prima dell avvio: e cosi che la
   * schermata iniziale si lascia comandare dal joystick. */
  pollPad(dt) {
    const list = navigator.getGamepads ? navigator.getGamepads() : null;
    let p = null;
    if (list) {
      if (this.padIndex >= 0 && list[this.padIndex]) p = list[this.padIndex];
      if (!p) {
        for (let i = 0; i < list.length; i++) {
          if (list[i] && list[i].connected) { p = list[i]; this.padIndex = i; break; }
        }
      }
    }
    this.pad = p;
    if (!p) {
      this._padMove.x = this._padMove.y = 0;
      this._padLook.x = this._padLook.y = 0;
      this._padRun = this._padCrouch = this._padJump = false;
      this._padPrev.length = 0;
      return;
    }

    const ax = p.axes || [];
    const bt = p.buttons || [];
    const held = (i, soglia) => {
      const b = bt[i];
      if (!b) return false;
      return typeof b === 'number' ? b > (soglia || 0.5)
                                   : (b.pressed || b.value > (soglia || 0.5));
    };

    const L = this._stick(ax[0] || 0, ax[1] || 0);
    const R = this._stick(ax[2] || 0, ax[3] || 0);

    /* La croce direzionale muove come una leva spinta a fondo: su molti pad
     * economici e l unica cosa che risponde bene. */
    const dx = (held(15) ? 1 : 0) - (held(14) ? 1 : 0);
    const dy = (held(13) ? 1 : 0) - (held(12) ? 1 : 0);
    this._padMove.x = Math.max(-1, Math.min(1, L.x + dx));
    this._padMove.y = Math.max(-1, Math.min(1, L.y + dy));

    /* Curva sulla leva destra: al quadrato vicino al centro si mira fine, a
     * fondo corsa si gira comunque veloce. Lineare non basta per entrambe. */
    const curva = (v) => v * Math.abs(v);
    const inv = this.padInvertY !== this.invertY;
    this._padLook.x = curva(R.x) * this.padLookSpeed * dt;
    this._padLook.y = curva(R.y) * this.padLookSpeed * dt * (inv ? -1 : 1);

    this._padRun = held(7, 0.35) || held(5) || held(10);
    this._padCrouch = held(6, 0.35) || held(11);
    this._padJump = held(0);

    // fronti di salita, per le funzioni a interruttore
    const names = FirstPersonControls.PAD_BUTTONS;
    for (const k in names) {
      const i = +k;
      const ora = held(i, 0.5);
      if (ora && !this._padPrev[i] && this.onPadPress) this.onPadPress(names[k]);
      this._padPrev[i] = ora;
    }

    /* Nei menu la leva deve comportarsi come una freccia tenuta premuta: uno
     * scatto subito, poi una pausa, poi la ripetizione. Senza la pausa lunga
     * al primo scatto si salta di tre voci ogni volta che la si sfiora. */
    let dir = '';
    if (Math.abs(this._padMove.y) > Math.abs(this._padMove.x)) {
      if (this._padMove.y < -0.6) dir = 'su';
      else if (this._padMove.y > 0.6) dir = 'giu';
    } else {
      if (this._padMove.x < -0.6) dir = 'sinistra';
      else if (this._padMove.x > 0.6) dir = 'destra';
    }
    if (dir !== this._navDir) {
      this._navDir = dir;
      this._navTimer = 0.34;
      if (dir && this.onPadPress) this.onPadPress(dir);
    } else if (dir) {
      this._navTimer -= dt;
      if (this._navTimer <= 0) {
        this._navTimer = 0.13;
        if (this.onPadPress) this.onPadPress(dir);
      }
    }
  }

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

    // mira col joystick: non serve il puntatore agganciato
    if (this._padLook.x || this._padLook.y) {
      this.yaw -= this._padLook.x;
      this.pitch -= this._padLook.y;
      this.pitch = Math.max(-PI2 + 0.001, Math.min(PI2 - 0.001, this.pitch));
    }

    const k = this.keys;
    const pm = this._padMove;
    let fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let str = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const run = !!(k.ShiftLeft || k.ShiftRight) || this._padRun;
    const crouch = !!(k.ControlLeft || k.ControlRight || k.KeyC) || this._padCrouch;
    const jump = !!k.Space || this._padJump;

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // avanti nel piano orizzontale (yaw = 0 guarda verso -Z)
    const fx = -sy, fz = -cy;
    const rx = cy, rz = -sy;

    /* La tastiera e digitale e va normalizzata (o in diagonale si correrebbe
     * piu veloce); il joystick invece porta con se quanto e spinto, e quella
     * intensita va conservata: e tutta la differenza fra passeggiare e
     * correre. Si sommano dopo, e si taglia solo se insieme superano 1. */
    let wishX = fx * fwd + rx * str;
    let wishZ = fz * fwd + rz * str;
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 1e-4) { wishX /= wl; wishZ /= wl; }
    if (pm.x || pm.y) {
      wishX += fx * -pm.y + rx * pm.x;
      wishZ += fz * -pm.y + rz * pm.x;
      const l2 = Math.hypot(wishX, wishZ);
      if (l2 > 1) { wishX /= l2; wishZ /= l2; }
      // in volo il verso lo danno le stesse leve
      fwd = Math.max(-1, Math.min(1, fwd - pm.y));
      str = Math.max(-1, Math.min(1, str + pm.x));
    }

    if (this.fly) {
      let speed = this.flySpeed * this.speedScale * (run ? 3.2 : 1) * (crouch ? 0.3 : 1);
      const up = (jump ? 1 : 0) - (crouch ? 1 : 0);
      // in volo si guarda dove si punta: usa anche il pitch
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const dirX = fx * cp, dirY = sp, dirZ = fz * cp;
      const vx = dirX * fwd + rx * str;
      const vy = dirY * fwd + up;
      const vz = dirZ * fwd + rz * str;
      /* Si divide per il massimo fra la lunghezza e 1: cosi la tastiera (che
       * da sempre 1) vola alla stessa velocita di prima, ma una leva spinta a
       * meta fa davvero volare piano. */
      const l = Math.max(1, Math.hypot(vx, vy, vz));
      if (Math.abs(vx) + Math.abs(vy) + Math.abs(vz) > 1e-4) {
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
      if (jump && this.grounded > 0) {
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
    window.removeEventListener('gamepadconnected', this._onPadConnect);
    window.removeEventListener('gamepaddisconnected', this._onPadDisconnect);
  }
}
