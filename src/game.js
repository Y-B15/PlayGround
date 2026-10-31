import * as THREE from 'three'
import {
  FIELD, CAR, GRAVITY, BALL_GRAVITY, DIFFICULTY,
  clamp, wrapAngle, rand,
} from './constants.js'
import { BotBrain } from './ai.js'

const HALF_W = FIELD.W / 2
const HALF_L = FIELD.L / 2
const BALL_R = FIELD.BALL_R

function makeInput() {
  return { throttle: 0, steer: 0, boost: false, jumpPressed: false, jumpHeld: false }
}

function makeCar(team, index) {
  return {
    index,
    team,
    isBot: true,
    active: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    boost: 34,
    onGround: true,
    jumpCount: 0,
    boosting: false,
    boostingVis: 0,
    flipTimer: 0,
    flipDir: 1,
    pitchVis: 0,
    rollVis: 0,
    wheelSpin: 0,
    hitCooldown: 0,
    ai: null,
    input: makeInput(),
    lastJump: -10,
    skill: 1,
    demoOffset: Math.random() * 10,
  }
}

export class Game {
  constructor() {
    this.config = { mode: '1v1', difficulty: 'pro', duration: 180 }
    this.phase = 'menu'
    this.pausedFrom = null
    this.events = []
    this.time = 0
    this.demoTime = 0
    this.score = { blue: 0, orange: 0 }
    this.timer = 180
    this.overtime = false
    this.pendingEnd = false
    this.countdown = 0
    this.lastCount = 0
    this.goalTimer = 0
    this.lastGoal = null
    this.matchStats = { hits: 0, boostUsed: 0, saves: 0 }
    this.ball = {
      pos: new THREE.Vector3(0, BALL_R, 0),
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      lastTouch: null,
      quat: new THREE.Quaternion(),
    }
    this.cars = [
      makeCar('blue', 0),
      makeCar('blue', 1),
      makeCar('orange', 2),
      makeCar('orange', 3),
    ]
    this.cars[0].isBot = false
    this.pads = this.makePads()
    this.resetPositions()
    // menu showroom uses the default 1v1 pairing
    this.cars[0].active = true
    this.cars[2].active = true
  }

  makePads() {
    const pads = []
    const big = [[-26, -38], [26, -38], [-26, 38], [26, 38]]
    const small = [[0, -50], [0, 50], [-28, 0], [28, 0], [-28, -20], [28, 20], [-28, 20], [28, -20]]
    for (const [x, z] of big) pads.push({ x, z, big: true, active: true, timer: 0, spin: Math.random() * 6 })
    for (const [x, z] of small) pads.push({ x, z, big: false, active: true, timer: 0, spin: Math.random() * 6 })
    return pads
  }

  configureCars() {
    const twoVTwo = this.config.mode === '2v2'
    this.cars.forEach((c) => {
      c.active = c.index === 0 || c.index === 2 || (twoVTwo && (c.index === 1 || c.index === 3))
    })
    const diff = DIFFICULTY[this.config.difficulty] || DIFFICULTY.pro
    this.cars.forEach((c) => {
      if (!c.isBot) return
      c.skill = diff.speed
      if (!c.ai) c.ai = new BotBrain(c, this)
      c.ai.setDifficulty(diff)
    })
  }

  startMatch(config = this.config) {
    this.config = { ...this.config, ...config }
    this.configureCars()
    this.score = { blue: 0, orange: 0 }
    this.timer = this.config.duration
    this.overtime = false
    this.pendingEnd = false
    this.lastGoal = null
    this.matchStats = { hits: 0, boostUsed: 0, saves: 0 }
    this.events.push({ type: 'start' })
    this.kickoff()
  }

  kickoff() {
    this.resetPositions()
    this.phase = 'countdown'
    this.countdown = 3.15
    this.lastCount = 4
    this.goalTimer = 0
    for (const p of this.pads) {
      p.active = true
      p.timer = 0
    }
    for (const c of this.cars) {
      c.boost = 34
      c.boosting = false
      c.flipTimer = 0
    }
  }

  resetPositions() {
    const blueKick = [
      [-6, -30],
      [12, -33],
    ]
    const orangeKick = [
      [6, 30],
      [-12, 33],
    ]
    const blue = this.cars.filter((c) => c.team === 'blue')
    const orange = this.cars.filter((c) => c.team === 'orange')
    const place = (car, p) => {
      car.pos.set(p[0], CAR.groundY, p[1])
      car.vel.set(0, 0, 0)
      car.yaw = Math.atan2(-p[0], -p[1])
      car.onGround = true
      car.jumpCount = 0
      car.pitchVis = 0
      car.rollVis = 0
      car.boosting = false
      car.boostingVis = 0
      car.flipTimer = 0
      car.hitCooldown = 0
    }
    place(blue[0], blueKick[0])
    place(blue[1], blueKick[1])
    place(orange[0], orangeKick[0])
    place(orange[1], orangeKick[1])
    this.ball.pos.set(0, BALL_R, 0)
    this.ball.vel.set(0, 0, 0)
    this.ball.spin.set(0, 0, 0)
    this.ball.lastTouch = null
    this.ball.quat.identity()
  }

  get playerCar() {
    return this.cars[0]
  }

  getActiveCars() {
    return this.cars.filter((c) => c.active)
  }

  pause() {
    if (this.phase === 'play' || this.phase === 'countdown' || this.phase === 'goal') {
      this.pausedFrom = this.phase
      this.phase = 'paused'
      return true
    }
    return false
  }

  resume() {
    if (this.phase === 'paused' && this.pausedFrom) {
      this.phase = this.pausedFrom
      this.pausedFrom = null
    }
  }

  toMenu() {
    this.phase = 'menu'
    this.pausedFrom = null
    this.resetPositions()
    this.demoTime = 0
  }

  update(dt, playerInput) {
    this.time += dt
    if (this.phase === 'menu') {
      this.demoTime += dt
      return
    }
    if (this.phase === 'paused' || this.phase === 'ended') return

    if (this.phase === 'countdown') {
      this.countdown -= dt
      const n = Math.ceil(this.countdown)
      if (n < this.lastCount && n > 0) {
        this.lastCount = n
        this.events.push({ type: 'countdown', value: n })
      }
      if (this.countdown <= 0) {
        this.phase = 'play'
        this.events.push({ type: 'go' })
      }
      return
    }

    if (this.phase === 'goal') {
      this.goalTimer -= dt
      this.stepBall(dt, true)
      if (this.goalTimer <= 0) this.afterGoal()
      return
    }

    // ---------------- live play ----------------
    if (!this.overtime) {
      this.timer = Math.max(0, this.timer - dt)
      if (this.timer <= 0 && this.score.blue === this.score.orange && !this.pendingEnd) {
        this.overtime = true
        this.events.push({ type: 'overtime' })
      }
    }

    for (const car of this.cars) {
      if (!car.active) continue
      car.hitCooldown = Math.max(0, car.hitCooldown - dt)
      const input = car.isBot && car.ai ? car.ai.update(dt, this) : playerInput
      car.input = input
      this.stepCar(car, input, dt)
    }

    this.collideCars()
    this.stepBall(dt, false)
    for (const car of this.cars) {
      if (car.active) this.collideCarBall(car)
    }
    this.collidePosts()
    this.updatePads(dt)

    if (this.checkGoal()) return

    if (this.timer <= 0 && !this.overtime && !this.pendingEnd && this.phase === 'play') {
      if (this.score.blue !== this.score.orange) {
        if (this.ball.pos.y > BALL_R + 2.2) {
          this.pendingEnd = true
        } else {
          this.endMatch()
        }
      }
    }
    if (this.pendingEnd && this.ball.pos.y <= BALL_R + 0.5) {
      this.endMatch()
    }
  }

  // ---------------------------------------------------------------- CARS
  stepCar(car, input, dt) {
    const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw))
    const right = new THREE.Vector3(Math.cos(car.yaw), 0, -Math.sin(car.yaw))
    let vf = car.vel.dot(fwd)
    const speed = car.vel.length()

    if (car.onGround) {
      const steerAuth = clamp(0.22 + Math.abs(vf) / 16, 0, 1)
      const reverse = vf < -0.8 ? -1 : 1
      car.yaw += input.steer * 2.9 * steerAuth * reverse * dt
      fwd.set(Math.sin(car.yaw), 0, Math.cos(car.yaw))
      right.set(Math.cos(car.yaw), 0, -Math.sin(car.yaw))
      vf = car.vel.dot(fwd)

      let accel = 0
      if (input.throttle > 0.04) {
        accel = vf < -1 ? 82 * input.throttle : 50 * input.throttle
      } else if (input.throttle < -0.04) {
        accel = vf > 1 ? 78 * input.throttle : 30 * input.throttle
      }
      car.vel.addScaledVector(fwd, accel * dt)

      // lateral grip
      const lat = car.vel.dot(right)
      car.vel.addScaledVector(right, -lat * Math.min(1, 9 * dt))

      // rolling drag
      const drag = input.throttle === 0 ? 0.75 : 0.18
      car.vel.multiplyScalar(1 - drag * dt)

      const maxF = car.boosting ? CAR.boostSpeed : CAR.maxSpeed
      vf = car.vel.dot(fwd)
      if (vf > maxF) car.vel.addScaledVector(fwd, -(vf - maxF) * Math.min(1, 5 * dt))
      if (vf < -CAR.reverseSpeed) car.vel.addScaledVector(fwd, -(vf + CAR.reverseSpeed) * Math.min(1, 5 * dt))
    } else {
      car.yaw += input.steer * 1.75 * dt
      fwd.set(Math.sin(car.yaw), 0, Math.cos(car.yaw))
      right.set(Math.cos(car.yaw), 0, -Math.sin(car.yaw))
    }

    // jump / flip
    if (input.jumpPressed) {
      if (car.onGround) {
        car.vel.y = CAR.jumpVel
        car.onGround = false
        car.jumpCount = 1
        car.lastJump = this.time
        this.events.push({ type: 'jump', car })
      } else if (car.jumpCount < 2) {
        car.vel.y = Math.max(car.vel.y, CAR.doubleJumpVel)
        car.jumpCount = 2
        car.flipTimer = 0.42
        car.flipDir = input.steer < -0.25 ? -1 : 1
        car.vel.addScaledVector(fwd, 12)
        car.vel.addScaledVector(right, input.steer * 5)
        this.events.push({ type: 'flip', car })
      }
    }

    // boost
    if (input.boost && car.boost > 0.5) {
      car.boosting = true
      const use = 33 * dt
      car.boost = Math.max(0, car.boost - use)
      this.matchStats.boostUsed += use
      car.vel.addScaledVector(fwd, (car.onGround ? 46 : 32) * dt)
      if (!car.onGround) car.vel.y += 19 * dt
      if (car.vel.length() > CAR.boostSpeed + 4) car.vel.setLength(CAR.boostSpeed + 4)
      if (Math.random() < dt * 55) {
        this.events.push({ type: 'boostParticle', car })
      }
    } else {
      car.boosting = false
    }
    car.boostingVis += ((car.boosting ? 1 : 0) - car.boostingVis) * Math.min(1, 12 * dt)

    if (!car.onGround) car.vel.y -= GRAVITY * dt

    car.pos.addScaledVector(car.vel, dt)

    // ground
    if (car.pos.y <= CAR.groundY) {
      if (!car.onGround) {
        this.events.push({ type: 'land', car, power: Math.abs(car.vel.y) })
      }
      car.pos.y = CAR.groundY
      if (car.vel.y < 0) car.vel.y = 0
      car.onGround = true
      car.jumpCount = 0
      car.flipTimer = 0
    } else {
      car.onGround = false
    }

    // arena bounds
    const bx = HALF_W - 2.2
    const bz = HALF_L - 2.2
    if (car.pos.x > bx) { car.pos.x = bx; car.vel.x = -Math.abs(car.vel.x) * 0.25 }
    if (car.pos.x < -bx) { car.pos.x = -bx; car.vel.x = Math.abs(car.vel.x) * 0.25 }
    if (car.pos.z > bz) { car.pos.z = bz; car.vel.z = -Math.abs(car.vel.z) * 0.25 }
    if (car.pos.z < -bz) { car.pos.z = -bz; car.vel.z = Math.abs(car.vel.z) * 0.25 }

    // visual tilt
    const targetPitch = car.onGround ? 0 : clamp(-input.throttle * 0.38, -0.45, 0.45)
    const targetRoll = car.onGround ? 0 : clamp(input.steer * 0.5, -0.55, 0.55)
    car.pitchVis += (targetPitch - car.pitchVis) * Math.min(1, 8 * dt)
    car.rollVis += (targetRoll - car.rollVis) * Math.min(1, 8 * dt)
    if (car.flipTimer > 0) car.flipTimer = Math.max(0, car.flipTimer - dt)
    car.wheelSpin += vf * dt / 1.05
  }

  collideCars() {
    const active = this.getActiveCars()
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]
        const b = active[j]
        const dx = b.pos.x - a.pos.x
        const dz = b.pos.z - a.pos.z
        const d2 = dx * dx + dz * dz
        const minD = 6.2
        if (d2 > minD * minD || d2 < 0.0001) continue
        const d = Math.sqrt(d2)
        const nx = dx / d
        const nz = dz / d
        const overlap = minD - d
        a.pos.x -= nx * overlap * 0.5
        a.pos.z -= nz * overlap * 0.5
        b.pos.x += nx * overlap * 0.5
        b.pos.z += nz * overlap * 0.5
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz
        if (rel < 0) {
          const imp = -rel * 0.55
          a.vel.x -= nx * imp
          a.vel.z -= nz * imp
          b.vel.x += nx * imp
          b.vel.z += nz * imp
          if (Math.abs(rel) > 10) {
            this.events.push({ type: 'carBump', power: Math.abs(rel), x: (a.pos.x + b.pos.x) / 2, y: 1.5, z: (a.pos.z + b.pos.z) / 2 })
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- BALL
  stepBall(dt, frozen) {
    const b = this.ball
    b.vel.y -= BALL_GRAVITY * dt
    b.vel.multiplyScalar(1 - 0.055 * dt)
    b.pos.addScaledVector(b.vel, dt)

    // floor
    if (b.pos.y < BALL_R) {
      b.pos.y = BALL_R
      if (b.vel.y < -0.8) {
        const impact = Math.abs(b.vel.y)
        b.vel.y = -b.vel.y * 0.63
        b.vel.x *= 0.995
        b.vel.z *= 0.995
        if (impact > 7) this.events.push({ type: 'bounce', power: impact, x: b.pos.x, y: BALL_R, z: b.pos.z, surface: 'floor' })
      } else {
        b.vel.y = 0
        b.vel.x *= 1 - 0.55 * dt
        b.vel.z *= 1 - 0.55 * dt
      }
    }
    // ceiling
    if (b.pos.y > FIELD.WALL - BALL_R) {
      b.pos.y = FIELD.WALL - BALL_R
      if (b.vel.y > 0) {
        const impact = b.vel.y
        b.vel.y = -b.vel.y * 0.55
        if (impact > 6) this.events.push({ type: 'bounce', power: impact, x: b.pos.x, y: b.pos.y, z: b.pos.z, surface: 'ceiling' })
      }
    }
    // side walls
    if (b.pos.x > HALF_W - BALL_R) {
      b.pos.x = HALF_W - BALL_R
      if (b.vel.x > 0) {
        const impact = b.vel.x
        b.vel.x = -b.vel.x * 0.68
        if (impact > 6) this.events.push({ type: 'bounce', power: impact, x: b.pos.x, y: b.pos.y, z: b.pos.z, surface: 'wall' })
      }
    } else if (b.pos.x < -HALF_W + BALL_R) {
      b.pos.x = -HALF_W + BALL_R
      if (b.vel.x < 0) {
        const impact = -b.vel.x
        b.vel.x = -b.vel.x * 0.68
        if (impact > 6) this.events.push({ type: 'bounce', power: impact, x: b.pos.x, y: b.pos.y, z: b.pos.z, surface: 'wall' })
      }
    }

    const mouth = Math.abs(b.pos.x) < FIELD.GOAL_W / 2 - 0.5 && b.pos.y < FIELD.GOAL_H - 0.5

    // back wall (+Z)
    if (b.pos.z > HALF_L - BALL_R) {
      if (mouth) {
        // allow the ball through the mouth, then contain it in the recess
        if (b.pos.z > HALF_L) {
          if (b.pos.z > HALF_L + FIELD.GOAL_D - BALL_R) {
            b.pos.z = HALF_L + FIELD.GOAL_D - BALL_R
            if (b.vel.z > 0) b.vel.z = -b.vel.z * 0.32
          }
          const sideLimit = FIELD.GOAL_W / 2 - BALL_R
          if (b.pos.x > sideLimit) { b.pos.x = sideLimit; b.vel.x = -Math.abs(b.vel.x) * 0.4 }
          if (b.pos.x < -sideLimit) { b.pos.x = -sideLimit; b.vel.x = Math.abs(b.vel.x) * 0.4 }
        }
      } else {
        b.pos.z = HALF_L - BALL_R
        if (b.vel.z > 0) {
          const impact = b.vel.z
          b.vel.z = -b.vel.z * 0.68
          if (impact > 6) this.events.push({ type: 'bounce', power: impact, x: b.pos.x, y: b.pos.y, z: b.pos.z, surface: 'wall' })
        }
      }
    }
    // back wall (-Z)
    if (b.pos.z < -HALF_L + BALL_R) {
      if (mouth) {
        if (b.pos.z < -HALF_L) {
          if (b.pos.z < -HALF_L - FIELD.GOAL_D + BALL_R) {
            b.pos.z = -HALF_L - FIELD.GOAL_D + BALL_R
            if (b.vel.z < 0) b.vel.z = -b.vel.z * 0.32
          }
          const sideLimit = FIELD.GOAL_W / 2 - BALL_R
          if (b.pos.x > sideLimit) { b.pos.x = sideLimit; b.vel.x = -Math.abs(b.vel.x) * 0.4 }
          if (b.pos.x < -sideLimit) { b.pos.x = -sideLimit; b.vel.x = Math.abs(b.vel.x) * 0.4 }
        }
      } else {
        b.pos.z = -HALF_L + BALL_R
        if (b.vel.z < 0) {
          const impact = -b.vel.z
          b.vel.z = -b.vel.z * 0.68
          if (impact > 6) this.events.push({ type: 'bounce', power: impact, x: b.pos.x, y: b.pos.y, z: b.pos.z, surface: 'wall' })
        }
      }
    }

    if (b.vel.length() > 105) b.vel.setLength(105)

    // rolling spin for the mesh
    const horizontal = Math.hypot(b.vel.x, b.vel.z)
    if (horizontal > 0.2) {
      const axis = new THREE.Vector3(b.vel.z, 0, -b.vel.x).normalize()
      const q = new THREE.Quaternion().setFromAxisAngle(axis, (horizontal * dt) / BALL_R)
      b.quat.premultiply(q)
    }
  }

  collideCarBall(car) {
    const b = this.ball
    const dx = b.pos.x - car.pos.x
    const dz = b.pos.z - car.pos.z
    const cos = Math.cos(car.yaw)
    const sin = Math.sin(car.yaw)
    // world -> local (yaw around Y)
    const lx = dx * cos - dz * sin
    const lz = dx * sin + dz * cos
    const ly = b.pos.y - car.pos.y
    const cx = clamp(lx, -CAR.halfW, CAR.halfW)
    const cy = clamp(ly, -CAR.halfH, CAR.halfH)
    const cz = clamp(lz, -CAR.halfL, CAR.halfL)
    let nx = lx - cx
    let ny = ly - cy
    let nz = lz - cz
    let dist = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (dist >= BALL_R) return

    if (dist < 0.0001) {
      // centre inside the box: push out along the closest face
      const px = CAR.halfW - Math.abs(lx)
      const py = CAR.halfH - Math.abs(ly)
      const pz = CAR.halfL - Math.abs(lz)
      if (px < py && px < pz) { nx = Math.sign(lx) || 1; ny = 0; nz = 0; dist = -px }
      else if (py < pz) { nx = 0; ny = Math.sign(ly) || 1; nz = 0; dist = -py }
      else { nx = 0; ny = 0; nz = Math.sign(lz) || 1; dist = -pz }
    } else {
      nx /= dist; ny /= dist; nz /= dist
    }
    // local normal -> world
    const wnx = nx * cos + nz * sin
    const wny = ny
    const wnz = -nx * sin + nz * cos
    const n = new THREE.Vector3(wnx, wny, wnz).normalize()

    const penetration = BALL_R - dist
    b.pos.addScaledVector(n, penetration + 0.01)

    const rel = new THREE.Vector3().subVectors(b.vel, car.vel)
    const vn = rel.dot(n)
    if (vn < 0) {
      b.vel.addScaledVector(n, -vn * 1.45)
    }

    const drive = Math.max(0, car.vel.dot(n))
    const power = 2.6 + drive * 0.62 + (car.boosting ? 6.5 : 0) + (car.flipTimer > 0 ? 9 : 0)
    b.vel.addScaledVector(n, power * 0.55)
    if (n.y > -0.15) b.vel.y += 1.2 + drive * 0.045

    // Bots should not shovel the ball into their own net. Any bot touch in its
    // own half that would send the ball goalward is turned into a sideways
    // clearance instead. This is the main defence against own-goal spam.
    if (car.isBot) {
      const ownZ = car.team === 'blue' ? -HALF_L : HALF_L
      const ox = -b.pos.x
      const oz = ownZ - b.pos.z
      const ol = Math.hypot(ox, oz) || 1
      const vOwn = (b.vel.x * ox + b.vel.z * oz) / ol
      if (b.pos.z * ownZ > 0 && vOwn > 2) {
        const depth = clamp((Math.abs(b.pos.z) - HALF_L * 0.25) / (HALF_L * 0.75), 0.3, 1)
        const side = car.index % 2 === 0 ? 1 : -1
        const sx = (-oz / ol) * side
        const sz = (ox / ol) * side
        const cancel = vOwn / depth
        b.vel.x -= (ox / ol) * cancel
        b.vel.z -= (oz / ol) * cancel
        b.vel.x += sx * vOwn * 0.45
        b.vel.z += sz * vOwn * 0.45
        b.vel.y += Math.min(6, vOwn * 0.12)
      }
    }

    if (b.vel.length() > 105) b.vel.setLength(105)
    b.lastTouch = car.team
    car.hitCooldown = 0.08

    if (power > 8) {
      this.matchStats.hits++
      this.events.push({
        type: 'hit',
        power,
        team: car.team,
        x: b.pos.x,
        y: b.pos.y,
        z: b.pos.z,
        boosting: car.boosting,
      })
    }
  }

  collidePosts() {
    const b = this.ball
    const postR = 1.05
    for (const zs of [-1, 1]) {
      for (const xs of [-1, 1]) {
        const px = xs * FIELD.GOAL_W / 2
        const pz = zs * HALF_L
        if (b.pos.y > FIELD.GOAL_H + 1) continue
        const dx = b.pos.x - px
        const dz = b.pos.z - pz
        const d = Math.hypot(dx, dz)
        const min = BALL_R + postR
        if (d < min && d > 0.001) {
          const nx = dx / d
          const nz = dz / d
          b.pos.x = px + nx * min
          b.pos.z = pz + nz * min
          const vn = b.vel.x * nx + b.vel.z * nz
          if (vn < 0) {
            b.vel.x -= nx * vn * 1.65
            b.vel.z -= nz * vn * 1.65
            if (Math.abs(vn) > 7) this.events.push({ type: 'post', power: Math.abs(vn), x: b.pos.x, y: b.pos.y, z: b.pos.z })
          }
        }
      }
      // crossbar
      const dy = b.pos.y - FIELD.GOAL_H
      const dz = b.pos.z - zs * HALF_L
      const d = Math.hypot(dy, dz)
      const min = BALL_R + 0.55
      if (d < min && d > 0.001 && Math.abs(b.pos.x) < FIELD.GOAL_W / 2 + 2) {
        const ny = dy / d
        const nz = dz / d
        b.pos.y = FIELD.GOAL_H + ny * min
        b.pos.z = zs * HALF_L + nz * min
        const vn = b.vel.y * ny + b.vel.z * nz
        if (vn < 0) {
          b.vel.y -= ny * vn * 1.6
          b.vel.z -= nz * vn * 1.6
          if (Math.abs(vn) > 6) this.events.push({ type: 'post', power: Math.abs(vn), x: b.pos.x, y: b.pos.y, z: b.pos.z })
        }
      }
    }
  }

  checkGoal() {
    if (this.phase !== 'play') return false
    const b = this.ball
    const inMouth = Math.abs(b.pos.x) < FIELD.GOAL_W / 2 - 1 && b.pos.y < FIELD.GOAL_H - 1
    if (!inMouth) return false
    if (b.pos.z > HALF_L + 0.8) {
      this.scoreGoal('blue')
      return true
    }
    if (b.pos.z < -HALF_L - 0.8) {
      this.scoreGoal('orange')
      return true
    }
    return false
  }

  scoreGoal(team) {
    this.score[team]++
    this.phase = 'goal'
    this.goalTimer = 2.7
    this.lastGoal = { team, scorer: this.ball.lastTouch || team }
    for (const c of this.cars) {
      c.vel.set(0, 0, 0)
      c.boosting = false
      c.boostingVis = 0
    }
    this.events.push({
      type: 'goal',
      team,
      scorer: this.lastGoal.scorer,
      x: this.ball.pos.x,
      y: this.ball.pos.y,
      z: this.ball.pos.z,
      overtime: this.overtime,
    })
  }

  afterGoal() {
    if (this.overtime) {
      this.endMatch()
      return
    }
    if (this.timer <= 0) {
      this.endMatch()
      return
    }
    this.kickoff()
  }

  endMatch() {
    if (this.phase === 'ended') return
    this.phase = 'ended'
    const blue = this.score.blue
    const orange = this.score.orange
    const winner = blue === orange ? null : blue > orange ? 'blue' : 'orange'
    this.events.push({ type: 'end', winner, blue, orange, overtime: this.overtime })
  }

  updatePads(dt) {
    for (const p of this.pads) {
      p.spin += dt * 1.6
      if (!p.active) {
        p.timer -= dt
        if (p.timer <= 0) p.active = true
        continue
      }
      for (const car of this.cars) {
        if (!car.active) continue
        if (car.pos.y > 5) continue
        const dx = car.pos.x - p.x
        const dz = car.pos.z - p.z
        if (dx * dx + dz * dz < 4.3 * 4.3) {
          const before = car.boost
          car.boost = Math.min(100, car.boost + (p.big ? 100 : 12))
          if (car.boost > before + 0.5) {
            p.active = false
            p.timer = p.big ? 7 : 3.5
            this.events.push({ type: 'pickup', big: p.big, x: p.x, z: p.z, team: car.team })
            if (car === this.playerCar) this.events.push({ type: 'playerPickup', big: p.big })
          }
        }
      }
    }
  }
}
