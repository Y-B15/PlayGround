// World is measured in metres-ish. Field runs along Z, goals at +/- L/2.
export const FIELD = {
  W: 76,
  L: 120,
  WALL: 26,
  GOAL_W: 30,
  GOAL_H: 12,
  GOAL_D: 10,
  BALL_R: 3.4,
}

export const GRAVITY = 34
export const BALL_GRAVITY = 30

export const CAR = {
  halfW: 1.55,
  halfH: 0.95,
  halfL: 2.9,
  groundY: 1.18,
  maxSpeed: 46,
  boostSpeed: 72,
  reverseSpeed: 24,
  jumpVel: 17,
  doubleJumpVel: 15,
}

export const TEAM_COLORS = {
  blue: 0x2f7fff,
  orange: 0xff7a1f,
}

export const DIFFICULTY = {
  rookie: {
    label: 'ROOKIE',
    reaction: 0.38,
    speed: 0.82,
    boost: 0.35,
    aerial: 0.15,
    noise: 7,
    lead: 0.55,
    aggression: 0.55,
  },
  pro: {
    label: 'PRO',
    reaction: 0.2,
    speed: 0.95,
    boost: 0.72,
    aerial: 0.45,
    noise: 3.2,
    lead: 0.75,
    aggression: 0.8,
  },
  allstar: {
    label: 'ALL-STAR',
    reaction: 0.1,
    speed: 1.05,
    boost: 1,
    aerial: 0.85,
    noise: 1.4,
    lead: 0.92,
    aggression: 1,
  },
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
