import { FIELD, clamp, wrapAngle } from './constants.js'

const BALL_R = FIELD.BALL_R
const HALF_L = FIELD.L / 2

/**
 * Arcade bot brain. It aims for the point behind the ball relative to the
 * enemy goal, which naturally produces both attacks and defensive clearances.
 */
export class BotBrain {
  constructor(car, game) {
    this.car = car
    this.game = game
    this.diff = {
      reaction: 0.2, speed: 1, boost: 0.7, aerial: 0.4,
      noise: 3, lead: 0.7, aggression: 0.8,
    }
    this.input = { throttle: 0, steer: 0, boost: false, jumpPressed: false, jumpHeld: false }
    this.target = { x: 0, z: 0 }
    this.think = Math.random() * 0.2
    this.jumpCd = 0
    this.aerialTimer = -1
    this.stuckTimer = 0
    this.reverseTimer = 0
    this.seed = Math.random() * 100
    this.urgent = false
    this.wrongSide = false
    this.danger = false
    this.boostPulse = 0
    this.lastJumpAt = -10
  }

  setDifficulty(diff) {
    this.diff = diff
  }

  plan(game) {
    const car = this.car
    const ball = game.ball
    const attackSign = car.team === 'blue' ? 1 : -1
    const enemyZ = attackSign * HALF_L
    const ownZ = -attackSign * HALF_L

    const dBall = Math.hypot(ball.pos.x - car.pos.x, ball.pos.z - car.pos.z)
    const lead = clamp(dBall / 55, 0, 1.4) * this.diff.lead
    let px = ball.pos.x + ball.vel.x * lead
    let pz = ball.pos.z + ball.vel.z * lead
    px = clamp(px, -FIELD.W / 2 + 5, FIELD.W / 2 - 5)
    pz = clamp(pz, -HALF_L + 5, HALF_L - 5)

    // unit vector from the ball toward the goal we attack
    let gx = -px
    let gz = enemyZ - pz
    const gl = Math.hypot(gx, gz) || 1
    gx /= gl
    gz /= gl

    const offset = BALL_R + 3.9
    let tx = px - gx * offset
    let tz = pz - gz * offset

    // teammate support: hang back on the opposite side of the pitch
    if (game.config.mode === '2v2') {
      const mate = game.cars.find((c) => c.active && c !== car && c.team === car.team)
      if (mate) {
        const dMate = Math.hypot(ball.pos.x - mate.pos.x, ball.pos.z - mate.pos.z)
        if (dMate + 9 < dBall && ball.pos.z * attackSign > -12) {
          const side = car.index % 2 === 0 ? 1 : -1
          tx = px - gx * 19 - gz * 13 * side
          tz = pz - gz * 19 + gx * 13 * side
        }
      }
    }

    // defensive urgency: ball is near our goal and moving toward it
    const distToOwn = Math.hypot(ball.pos.x, ball.pos.z - ownZ)
    const movingToOwn = (ball.vel.x * -ball.pos.x + ball.vel.z * (ownZ - ball.pos.z)) > 20
    this.urgent = distToOwn < 36 || (movingToOwn && distToOwn < 50)

    // approach the contact point at a slight angle so bots don't bulldoze the
    // ball straight into their own net
    const side = car.index % 2 === 0 ? 1 : -1
    const perpX = -gz
    const perpZ = gx
    tx += perpX * 2.8 * side
    tz += perpZ * 2.8 * side

    // if the car is on the enemy side of the ball it could shove it into its
    // own net, so swing wide and get back goal-side first
    const bx = ball.pos.x - car.pos.x
    const bz = ball.pos.z - car.pos.z
    const ownDirX = -ball.pos.x
    const ownDirZ = ownZ - ball.pos.z
    const ownLen = Math.hypot(ownDirX, ownDirZ) || 1
    this.wrongSide = (bx * ownDirX + bz * ownDirZ) / ownLen > 0
    if (dBall < 18 && this.wrongSide) {
      tx += perpX * 13 * side
      tz += perpZ * 13 * side
    }

    // a ball rolling at our own net must not be chased through from behind:
    // swing to the side instead of turning it into an own goal
    const odx = -ball.pos.x / ownLen
    const odz = (ownZ - ball.pos.z) / ownLen
    const ballToOwnSpeed = ball.vel.x * odx + ball.vel.z * odz
    const carOnFieldSide = bx * odx + bz * odz < 0
    this.danger = ballToOwnSpeed > 4 && carOnFieldSide && dBall < 30
    if (this.danger) {
      tx = ball.pos.x + perpX * 11 * side + odx * 3
      tz = ball.pos.z + perpZ * 11 * side + odz * 3
    }

    // add human-ish aim noise
    const t = game.time
    tx += Math.sin(t * 1.9 + this.seed) * this.diff.noise
    tz += Math.cos(t * 1.45 + this.seed * 1.7) * this.diff.noise * 0.8

    // don't park inside our own goal mouth: defend from the field side instead
    const ownGoalDist = Math.abs(tz - ownZ)
    if (ownGoalDist < 9 && Math.abs(tx) < FIELD.GOAL_W / 2 + 7) {
      tz += attackSign * (9 - ownGoalDist)
      tx += (tx >= 0 ? 1 : -1) * 3
    }

    this.target.x = clamp(tx, -FIELD.W / 2 + 3, FIELD.W / 2 - 3)
    this.target.z = clamp(tz, -HALF_L + 3, HALF_L - 3)
  }

  update(dt, game) {
    const car = this.car
    const ball = game.ball
    const inp = this.input
    inp.jumpPressed = false
    this.jumpCd = Math.max(0, this.jumpCd - dt)
    this.boostPulse = Math.max(0, this.boostPulse - dt)

    this.think -= dt
    if (this.think <= 0) {
      this.think = this.diff.reaction * (0.72 + Math.random() * 0.55)
      this.plan(game)
    }

    const dx = this.target.x - car.pos.x
    const dz = this.target.z - car.pos.z
    const distTarget = Math.hypot(dx, dz)
    const desiredYaw = Math.atan2(dx, dz)
    const diff = wrapAngle(desiredYaw - car.yaw)
    const absDiff = Math.abs(diff)

    let steer = clamp(diff * 2.0, -1, 1)
    let throttle = 1

    if (absDiff > 2.0) throttle = car.vel.length() > 16 ? -0.6 : 0.45
    else if (absDiff > 1.1) throttle = 0.25
    else if (absDiff > 0.6) throttle = 0.7
    if (distTarget < 2.2) throttle = 0.3

    // unstick: reverse out if pinned against a wall
    if (car.vel.length() < 2.5 && throttle > 0 && car.onGround) this.stuckTimer += dt
    else this.stuckTimer = 0
    if (this.stuckTimer > 1.15) {
      this.reverseTimer = 0.55
      this.stuckTimer = 0
    }
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt
      throttle = -1
      steer = -steer
    }

    const hd = Math.hypot(ball.pos.x - car.pos.x, ball.pos.z - car.pos.z)
    const facing = absDiff < 0.38
    const speed = car.vel.length()

    // boost toward the play
    let boost = false
    if (car.boost > 4 && facing) {
      const threshold = this.diff.boost > 0.8 ? 14 : this.diff.boost > 0.5 ? 24 : 34
      if (hd > threshold || (this.urgent && hd > 10)) {
        if (this.diff.boost >= 0.95) boost = true
        else {
          if (this.boostPulse <= 0) this.boostPulse = 0.22 + Math.random() * 0.3
          boost = true
        }
      }
    }
    // tap boost when already fast and lined up
    if (!boost && facing && car.boost > 30 && speed < 38 && hd > 18 && this.diff.boost > 0.6) boost = true

    // ---------------- aerial / jump play ----------------
    const ballAbove = ball.pos.y > 4.6
    const canAerial = this.diff.aerial > 0.2
    if (this.aerialTimer > 0) {
      this.aerialTimer -= dt
      if (this.aerialTimer <= 0) {
        if (!car.onGround && car.jumpCount < 2 && hd < 12 && ball.pos.y > 3) {
          inp.jumpPressed = true
          this.lastJumpAt = game.time
        }
        this.aerialTimer = -1
      }
    } else if (car.onGround && this.jumpCd <= 0 && canAerial) {
      const chance = this.diff.aerial * dt * 5
      if (ballAbove && hd < 13 && Math.abs(diff) < 1.1 && Math.random() < chance) {
        inp.jumpPressed = true
        this.jumpCd = 1.5
        this.aerialTimer = 0.3
        this.lastJumpAt = game.time
      } else if (hd < 7.5 && ball.pos.y > 2.6 && ball.pos.y < 7 && Math.random() < chance * 0.7) {
        inp.jumpPressed = true
        this.jumpCd = 1.2
        this.aerialTimer = 0.22
        this.lastJumpAt = game.time
      }
    }

    if (this.wrongSide && hd < 8.5) throttle = -0.4
    if (this.danger && hd < 12) {
      throttle = car.vel.length() > 6 ? -0.55 : 0.15
      boost = false
      steer = clamp(diff * 2.6, -1, 1)
    }

    inp.steer = steer
    inp.throttle = throttle
    inp.boost = boost && car.boost > 0
    inp.jumpHeld = false
    return inp
  }
}
