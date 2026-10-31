import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { FIELD, CAR, TEAM_COLORS, clamp, wrapAngle } from './constants.js'

const HALF_W = FIELD.W / 2
const HALF_L = FIELD.L / 2
const R = FIELD.BALL_R

const C = {
  blue: new THREE.Color(0x2f8bff),
  orange: new THREE.Color(0xff7a1f),
  ice: new THREE.Color(0x9fe4ff),
  white: new THREE.Color(0xdff3ff),
  amber: new THREE.Color(0xffb347),
}

function glowColor(hex, intensity = 2.2) {
  return new THREE.Color(hex).multiplyScalar(intensity)
}

function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  tex.anisotropy = 4
  return tex
}

function makePitchTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7)
    g.addColorStop(0, '#102640')
    g.addColorStop(0.55, '#0a1628')
    g.addColorStop(1, '#050b16')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // hex grid
    const s = 56
    const hh = (Math.sqrt(3) / 2) * s
    ctx.lineWidth = 1.4
    for (let row = -1; row < h / hh + 1; row++) {
      for (let col = -1; col < w / (s * 1.5) + 1; col++) {
        const cx = col * s * 1.5
        const cy = row * hh * 2 + (col % 2 ? hh : 0)
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6
          const x = cx + Math.cos(a) * s * 0.92
          const y = cy + Math.sin(a) * s * 0.92
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.strokeStyle = 'rgba(70,140,220,0.16)'
        ctx.stroke()
        if ((row * 7 + col * 3) % 11 === 0) {
          ctx.fillStyle = 'rgba(40,110,200,0.055)'
          ctx.fill()
        }
      }
    }
    // subtle noise
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgba(120,180,255,${Math.random() * 0.03})`
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
    }
  }, 4, 6)
}

function makeNetTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(150,215,255,0.75)'
    ctx.lineWidth = 2
    const step = 22
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(200,240,255,0.95)'
    ctx.lineWidth = 6
    ctx.strokeRect(3, 3, w - 6, h - 6)
  })
}

function makeBannerTexture(title, subtitle, hex) {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#0b1626')
    g.addColorStop(0.5, '#0d1d35')
    g.addColorStop(1, '#050a13')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // faint hex pattern
    ctx.strokeStyle = 'rgba(120,180,255,0.08)'
    ctx.lineWidth = 2
    for (let x = -40; x < w + 40; x += 56) {
      for (let y = -40; y < h + 40; y += 48) {
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6
          const px = x + Math.cos(a) * 30
          const py = y + Math.sin(a) * 30
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.stroke()
      }
    }
    ctx.strokeStyle = hex
    ctx.lineWidth = 9
    ctx.strokeRect(10, 10, w - 20, h - 20)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 2
    ctx.strokeRect(24, 24, w - 48, h - 48)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'italic 900 108px "Arial Black", Arial, sans-serif'
    ctx.fillStyle = hex
    ctx.shadowColor = hex
    ctx.shadowBlur = 34
    ctx.fillText(title, w / 2, h / 2 - 14)
    ctx.shadowBlur = 0
    ctx.font = '700 27px Arial, sans-serif'
    ctx.fillStyle = 'rgba(205,232,255,0.72)'
    ctx.fillText(subtitle, w / 2, h - 52)
  })
}

function makeGlassGridTexture(rx, ry) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(120,190,255,0.8)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 0); ctx.lineTo(0, h)
    ctx.moveTo(0, 0); ctx.lineTo(w, 0)
    ctx.stroke()
  }, rx, ry)
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(190,235,255,0.55)')
  g.addColorStop(1, 'rgba(120,190,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

class Particles {
  constructor(scene, max, size, opacity) {
    this.max = max
    this.cursor = 0
    this.data = new Array(max)
    this.positions = new Float32Array(max * 3)
    this.colors = new Float32Array(max * 3)
    for (let i = 0; i < max; i++) {
      this.positions[i * 3 + 1] = -999
      this.data[i] = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0, drag: 0, grav: 0 }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    const mat = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      map: makeGlowTexture(),
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  spawn(x, y, z, vx, vy, vz, color, life, drag = 1.2, grav = 4) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.max
    const d = this.data[i]
    d.life = life
    d.max = life
    d.vx = vx
    d.vy = vy
    d.vz = vz
    d.r = color.r
    d.g = color.g
    d.b = color.b
    d.drag = drag
    d.grav = grav
    this.positions[i * 3] = x
    this.positions[i * 3 + 1] = y
    this.positions[i * 3 + 2] = z
    this.colors[i * 3] = color.r
    this.colors[i * 3 + 1] = color.g
    this.colors[i * 3 + 2] = color.b
  }

  burst(x, y, z, color, count, speed, life = 0.8, up = 3) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const b = Math.random() * Math.PI - Math.PI / 2
      const s = speed * (0.35 + Math.random() * 0.9)
      this.spawn(
        x, y, z,
        Math.cos(a) * Math.cos(b) * s,
        Math.sin(b) * s + up,
        Math.sin(a) * Math.cos(b) * s,
        color, life * (0.5 + Math.random()), 1.6, 5,
      )
    }
  }

  update(dt) {
    const pos = this.positions
    const col = this.colors
    for (let i = 0; i < this.max; i++) {
      const d = this.data[i]
      if (d.life <= 0) continue
      d.life -= dt
      if (d.life <= 0) {
        pos[i * 3 + 1] = -999
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0
        continue
      }
      const k = Math.max(0, d.life / d.max)
      const drag = Math.max(0, 1 - d.drag * dt)
      d.vx *= drag
      d.vz *= drag
      d.vy = d.vy * drag - d.grav * dt
      pos[i * 3] += d.vx * dt
      pos[i * 3 + 1] += d.vy * dt
      pos[i * 3 + 2] += d.vz * dt
      col[i * 3] = d.r * k
      col[i * 3 + 1] = d.g * k
      col[i * 3 + 2] = d.b * k
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true
  }
}

function makeCarMesh(team, index) {
  const group = new THREE.Group()
  const teamColor = TEAM_COLORS[team]
  const paint = new THREE.MeshPhysicalMaterial({
    color: teamColor,
    metalness: 0.55,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.9,
  })
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0f1a, metalness: 0.6, roughness: 0.45 })
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x08131f, metalness: 0.9, roughness: 0.06, clearcoat: 1 })
  const accent = new THREE.MeshBasicMaterial({ color: glowColor(teamColor, 1.35), toneMapped: false })

  const body = new THREE.Mesh(new RoundedBoxGeometry(3.15, 0.95, 5.8, 4, 0.34), paint)
  body.position.y = 1.06
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const lower = new THREE.Mesh(new RoundedBoxGeometry(2.9, 0.5, 5.5, 3, 0.2), dark)
  lower.position.y = 0.72
  lower.castShadow = true
  group.add(lower)

  const cabin = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.78, 2.65, 4, 0.26), glass)
  cabin.position.set(0, 1.58, -0.28)
  cabin.castShadow = true
  group.add(cabin)

  // hood panel + racing stripes
  const hoodMat = new THREE.MeshStandardMaterial({
    color: teamColor, metalness: 0.45, roughness: 0.32,
    emissive: teamColor, emissiveIntensity: 0.22,
  })
  const hood = new THREE.Mesh(new RoundedBoxGeometry(2.7, 0.07, 1.9, 2, 0.03), hoodMat)
  hood.position.set(0, 1.56, 1.45)
  group.add(hood)
  for (const x of [-0.62, 0.62]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 4.4), accent)
    stripe.position.set(x, 1.55, 0.15)
    group.add(stripe)
  }

  // splitter + diffuser
  const splitter = new THREE.Mesh(new RoundedBoxGeometry(3.3, 0.22, 0.7, 2, 0.08), dark)
  splitter.position.set(0, 0.62, 2.72)
  group.add(splitter)
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.32, 0.5), dark)
  diffuser.position.set(0, 0.66, -2.78)
  group.add(diffuser)

  // spoiler
  const wing = new THREE.Mesh(new RoundedBoxGeometry(3.1, 0.13, 0.85, 2, 0.06), paint)
  wing.position.set(0, 2.02, -2.32)
  wing.castShadow = true
  group.add(wing)
  for (const x of [-1.15, 1.15]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.2), dark)
    strut.position.set(x, 1.73, -2.34)
    group.add(strut)
  }

  // lights
  const headMat = new THREE.MeshBasicMaterial({ color: glowColor(0xdff6ff, 2.6), toneMapped: false })
  const tailMat = new THREE.MeshBasicMaterial({ color: glowColor(0xff3b2f, 2.2), toneMapped: false })
  for (const x of [-1.0, 1.0]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.1), headMat)
    head.position.set(x, 1.16, 2.9)
    group.add(head)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.1), tailMat)
    tail.position.set(x, 1.12, -2.92)
    group.add(tail)
  }

  // wheels
  const wheelGroups = []
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.92, metalness: 0.1 })
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c8, roughness: 0.3, metalness: 0.9 })
  for (const x of [-1.53, 1.53]) {
    for (const z of [-1.82, 1.82]) {
      const wg = new THREE.Group()
      wg.position.set(x, 0.66, z)
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.56, 16), tireMat)
      tire.rotation.z = Math.PI / 2
      tire.castShadow = true
      wg.add(tire)
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.59, 12), rimMat)
      rim.rotation.z = Math.PI / 2
      wg.add(rim)
      group.add(wg)
      wheelGroups.push(wg)
    }
  }

  // underglow
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 7),
    new THREE.MeshBasicMaterial({
      color: teamColor, transparent: true, opacity: 0.24,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
  )
  under.rotation.x = -Math.PI / 2
  under.position.y = 0.05
  group.add(under)

  // boost flame
  const flame = new THREE.Group()
  flame.position.set(0, 1.02, -3.05)
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.52, 2.6, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: glowColor(0xff8a2b, 2.4), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }),
  )
  outer.rotation.x = -Math.PI / 2
  outer.position.z = -1.2
  flame.add(outer)
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 1.8, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: glowColor(0xfff0c0, 3), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }),
  )
  inner.rotation.x = -Math.PI / 2
  inner.position.z = -0.85
  flame.add(inner)
  const boostLight = new THREE.PointLight(0xff8a2b, 0, 16, 2)
  boostLight.position.set(0, 1.1, -3.4)
  flame.add(boostLight)
  flame.visible = false
  group.add(flame)

  group.userData = { wheels: wheelGroups, flame, boostLight, paint, accent, under, team, index }
  return group
}

function makePadMesh(big, teamColor) {
  const group = new THREE.Group()
  const col = big ? glowColor(0xffb347, 2.2) : glowColor(0xffc46b, 1.5)
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(big ? 2.5 : 1.5, big ? 2.5 : 1.5, 0.16, 6),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, toneMapped: false }),
  )
  base.position.y = 0.12
  group.add(base)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(big ? 2.9 : 1.8, 0.1, 8, 32),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, toneMapped: false }),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.2
  group.add(ring)
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(big ? 1.05 : 0.6, 0),
    new THREE.MeshBasicMaterial({ color: glowColor(0xfff0c0, 2.5), toneMapped: false }),
  )
  core.position.y = big ? 2.1 : 1.4
  group.add(core)
  group.userData = { ring, core, base, big }
  return group
}

export class World {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x03060d)
    this.scene.fog = new THREE.FogExp2(0x03060d, 0.0038)

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500)
    this.camera.position.set(0, 42, -105)
    this.camLook = new THREE.Vector3(0, 6, 0)
    this.shake = 0
    this.ballCam = true
    this.camMode = 1
    this.trailTimer = 0
    this.effects = []
    this.time = 0

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const envScene = new RoomEnvironment()
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture
    this.scene.environmentIntensity = 0.28
    envScene.dispose?.()

    this.buildLights()
    this.buildArena()
    this.buildBall()
    this.buildCars()
    this.buildPads()
    this.buildParticles()
    this.setupComposer()
    this.resize()
  }

  // ------------------------------------------------------------ lighting
  buildLights() {
    const hemi = new THREE.HemisphereLight(0x6f9fff, 0x0d0a1c, 0.85)
    this.scene.add(hemi)

    const key = new THREE.DirectionalLight(0xdcefff, 2.3)
    key.position.set(34, 72, 22)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -85
    key.shadow.camera.right = 85
    key.shadow.camera.top = 85
    key.shadow.camera.bottom = -85
    key.shadow.camera.near = 10
    key.shadow.camera.far = 180
    key.shadow.bias = -0.0008
    key.shadow.normalBias = 0.02
    this.scene.add(key)

    const fill = new THREE.DirectionalLight(0x3f6dff, 0.7)
    fill.position.set(-50, 30, -40)
    this.scene.add(fill)

    const blue = new THREE.PointLight(0x2f8bff, 320, 100, 2)
    blue.position.set(0, 16, -HALF_L + 4)
    this.scene.add(blue)
    const orange = new THREE.PointLight(0xff7a1f, 320, 100, 2)
    orange.position.set(0, 16, HALF_L - 4)
    this.scene.add(orange)
  }

  // ------------------------------------------------------------ arena
  buildArena() {
    const pitchTex = makePitchTexture()
    const groundMat = new THREE.MeshStandardMaterial({ map: pitchTex, color: 0xffffff, roughness: 0.82, metalness: 0.22 })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.W, FIELD.L), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    // soft centre glow
    const glowTex = makeGlowTexture()
    const centerGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(72, 72),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: 0x2f7fff, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    )
    centerGlow.rotation.x = -Math.PI / 2
    centerGlow.position.y = 0.03
    this.scene.add(centerGlow)

    const lineMat = new THREE.MeshBasicMaterial({ color: glowColor(0xbfe6ff, 0.9), transparent: true, opacity: 0.7, toneMapped: false })
    const addLine = (w, d, x, z, mat = lineMat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mat)
      m.position.set(x, 0.055, z)
      this.scene.add(m)
      return m
    }
    addLine(FIELD.W - 5, 0.3, 0, 0)
    addLine(0.3, FIELD.L - 5, -HALF_W + 2.5, 0)
    addLine(0.3, FIELD.L - 5, HALF_W - 2.5, 0)
    addLine(FIELD.W - 5, 0.3, 0, -HALF_L + 2.5)
    addLine(FIELD.W - 5, 0.3, 0, HALF_L - 2.5)

    // centre circle
    const ring = new THREE.Mesh(new THREE.RingGeometry(11.4, 11.8, 72), lineMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.06
    this.scene.add(ring)
    const dot = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), lineMat)
    dot.rotation.x = -Math.PI / 2
    dot.position.y = 0.06
    this.scene.add(dot)

    // goal boxes
    for (const zs of [-1, 1]) {
      addLine(44, 0.25, 0, zs * (HALF_L - 17))
      addLine(0.25, 15, -22, zs * (HALF_L - 9.5))
      addLine(0.25, 15, 22, zs * (HALF_L - 9.5))
      const pdot = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.68, 20), lineMat)
      pdot.rotation.x = -Math.PI / 2
      pdot.position.set(0, 0.06, zs * (HALF_L - 24))
      this.scene.add(pdot)
    }

    // team end-zone washes + emblems
    for (const [team, zs] of [['blue', -1], ['orange', 1]]) {
      const col = TEAM_COLORS[team]
      const zone = new THREE.Mesh(
        new THREE.PlaneGeometry(46, 20),
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.09,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      )
      zone.rotation.x = -Math.PI / 2
      zone.position.set(0, 0.04, zs * (HALF_L - 11))
      this.scene.add(zone)
      const emblem = new THREE.Mesh(
        new THREE.RingGeometry(6.2, 7.0, 6),
        new THREE.MeshBasicMaterial({ color: glowColor(col, 1.5), transparent: true, opacity: 0.45, toneMapped: false }),
      )
      emblem.rotation.x = -Math.PI / 2
      emblem.position.set(0, 0.065, zs * (HALF_L - 11))
      this.scene.add(emblem)
    }

    this.buildWalls()
    this.buildGoals()
    this.buildStands()
    this.buildCeiling()
    this.buildDust()
  }

  buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a1730, metalness: 0.55, roughness: 0.42 })
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x2b5c9c, metalness: 0.15, roughness: 0.08,
      transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false,
    })
    const trimMat = new THREE.MeshBasicMaterial({ color: glowColor(0x4fa8ff, 1.7), toneMapped: false })

    const wall = (w, h, d, x, y, z, mat = wallMat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      m.position.set(x, y, z)
      m.receiveShadow = true
      this.scene.add(m)
      return m
    }

    // faint glass grid overlays make the bounce walls readable
    const sideGridMat = new THREE.MeshBasicMaterial({
      map: makeGlassGridTexture(12, 3), transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    })
    const endGridMat = new THREE.MeshBasicMaterial({
      map: makeGlassGridTexture(3, 3), transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    })

    // side walls
    for (const xs of [-1, 1]) {
      wall(1.2, 5, FIELD.L, xs * (HALF_W + 0.4), 2.5, 0)
      wall(0.25, FIELD.WALL - 5, FIELD.L, xs * (HALF_W + 0.4), 5 + (FIELD.WALL - 5) / 2, 0, glassMat)
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, FIELD.L), trimMat)
      trim.position.set(xs * (HALF_W + 0.4), FIELD.WALL, 0)
      this.scene.add(trim)
      const lowTrim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, FIELD.L), trimMat)
      lowTrim.position.set(xs * (HALF_W + 0.3), 5.15, 0)
      this.scene.add(lowTrim)
      const grid = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.L, FIELD.WALL - 5), sideGridMat)
      grid.rotation.y = xs > 0 ? -Math.PI / 2 : Math.PI / 2
      grid.position.set(xs * (HALF_W + 0.16), 5 + (FIELD.WALL - 5) / 2, 0)
      this.scene.add(grid)
      // mullions
      for (let z = -HALF_L + 12; z <= HALF_L - 12; z += 16) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, FIELD.WALL - 5, 0.22), wallMat)
        post.position.set(xs * (HALF_W + 0.4), 5 + (FIELD.WALL - 5) / 2, z)
        this.scene.add(post)
      }
    }

    // end walls with a goal mouth
    const segW = (FIELD.W - FIELD.GOAL_W) / 2
    for (const zs of [-1, 1]) {
      for (const xs of [-1, 1]) {
        const cx = xs * (FIELD.GOAL_W / 2 + segW / 2)
        wall(segW, 5, 1.2, cx, 2.5, zs * (HALF_L + 0.4))
        wall(segW, FIELD.WALL - 5, 0.25, cx, 5 + (FIELD.WALL - 5) / 2, zs * (HALF_L + 0.4), glassMat)
        const grid = new THREE.Mesh(new THREE.PlaneGeometry(segW, FIELD.WALL - 5), endGridMat)
        grid.rotation.y = zs > 0 ? Math.PI : 0
        grid.position.set(cx, 5 + (FIELD.WALL - 5) / 2, zs * (HALF_L + 0.16))
        this.scene.add(grid)
      }
      // glass lintel above the goal
      wall(FIELD.GOAL_W + 2, FIELD.WALL - FIELD.GOAL_H, 1.2, 0, FIELD.GOAL_H + (FIELD.WALL - FIELD.GOAL_H) / 2, zs * (HALF_L + 0.4), glassMat)
      const lintelGrid = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.GOAL_W, FIELD.WALL - FIELD.GOAL_H), endGridMat)
      lintelGrid.rotation.y = zs > 0 ? Math.PI : 0
      lintelGrid.position.set(0, FIELD.GOAL_H + (FIELD.WALL - FIELD.GOAL_H) / 2, zs * (HALF_L + 0.16))
      this.scene.add(lintelGrid)
      const trim = new THREE.Mesh(new THREE.BoxGeometry(FIELD.W, 0.3, 0.3), trimMat)
      trim.position.set(0, FIELD.WALL, zs * (HALF_L + 0.4))
      this.scene.add(trim)
    }
  }

  buildGoals() {
    const netTex = makeNetTexture()
    for (const [team, zs] of [['blue', -1], ['orange', 1]]) {
      const col = TEAM_COLORS[team]
      const frameMat = new THREE.MeshBasicMaterial({ color: glowColor(col, 2.0), toneMapped: false })
      const zGoal = zs * HALF_L
      const zBack = zs * (HALF_L + FIELD.GOAL_D)

      const postGeo = new THREE.CylinderGeometry(0.42, 0.42, FIELD.GOAL_H, 12)
      for (const xs of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, frameMat)
        post.position.set(xs * FIELD.GOAL_W / 2, FIELD.GOAL_H / 2, zGoal)
        this.scene.add(post)
        const backPost = new THREE.Mesh(postGeo, frameMat)
        backPost.position.set(xs * FIELD.GOAL_W / 2, FIELD.GOAL_H / 2, zBack)
        this.scene.add(backPost)
        const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, FIELD.GOAL_D, 10), frameMat)
        topRail.rotation.x = Math.PI / 2
        topRail.position.set(xs * FIELD.GOAL_W / 2, FIELD.GOAL_H, zs * (HALF_L + FIELD.GOAL_D / 2))
        this.scene.add(topRail)
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, FIELD.GOAL_W, 12), frameMat)
      bar.rotation.z = Math.PI / 2
      bar.position.set(0, FIELD.GOAL_H, zGoal)
      this.scene.add(bar)

      const netMat = new THREE.MeshBasicMaterial({
        map: netTex, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
        color: glowColor(col, 1.2), depthWrite: false, toneMapped: false,
      })
      const back = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.GOAL_W, FIELD.GOAL_H), netMat)
      back.position.set(0, FIELD.GOAL_H / 2, zBack)
      this.scene.add(back)
      for (const xs of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.GOAL_D, FIELD.GOAL_H), netMat)
        side.rotation.y = Math.PI / 2
        side.position.set(xs * FIELD.GOAL_W / 2, FIELD.GOAL_H / 2, zs * (HALF_L + FIELD.GOAL_D / 2))
        this.scene.add(side)
      }
      const top = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.GOAL_W, FIELD.GOAL_D), netMat)
      top.rotation.x = Math.PI / 2
      top.position.set(0, FIELD.GOAL_H, zs * (HALF_L + FIELD.GOAL_D / 2))
      this.scene.add(top)

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD.GOAL_W, FIELD.GOAL_D),
        new THREE.MeshStandardMaterial({ color: 0x070d18, roughness: 0.8, metalness: 0.2 }),
      )
      floor.rotation.x = -Math.PI / 2
      floor.position.set(0, 0.02, zs * (HALF_L + FIELD.GOAL_D / 2))
      this.scene.add(floor)

      const wash = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD.GOAL_W, FIELD.GOAL_H),
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      )
      wash.position.set(0, FIELD.GOAL_H / 2, zBack - zs * 0.5)
      wash.rotation.y = zs > 0 ? Math.PI : 0
      this.scene.add(wash)

      // big glowing banner above the mouth
      const bannerTex = makeBannerTexture(
        team === 'blue' ? 'BLUE NET' : 'ORANGE NET',
        'DEFEND · ATTACK · SCORE',
        team === 'blue' ? '#4fa8ff' : '#ff9a4d',
      )
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(32, 8),
        new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, toneMapped: false }),
      )
      banner.position.set(0, 19.2, zs * (HALF_L + 0.1))
      banner.rotation.y = zs > 0 ? Math.PI : 0
      this.scene.add(banner)
    }

    // side wall banners
    for (const xs of [-1, 1]) {
      const tex = makeBannerTexture(
        'ROCKET RIVALS',
        xs < 0 ? 'BLUE SIDE' : 'ORANGE SIDE',
        xs < 0 ? '#4fa8ff' : '#ff9a4d',
      )
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(44, 11),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }),
      )
      banner.rotation.y = xs > 0 ? -Math.PI / 2 : Math.PI / 2
      banner.position.set(xs * (HALF_W + 0.1), 16.5, 0)
      this.scene.add(banner)
    }
  }

  buildStands() {
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x070c17, roughness: 0.9, metalness: 0.15 })
    const crowdGeo = new THREE.BoxGeometry(0.62, 0.9, 0.62)
    const crowdMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    const count = 460
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, count)
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    let idx = 0
    const palette = [0x2f8bff, 0xff7a1f, 0x8fc7ff, 0xffc58a, 0xdff3ff, 0x355a8a, 0x7a3f16]
    for (let tier = 0; tier < 3; tier++) {
      const h = 2 + tier * 2.4
      const off = 4 + tier * 4.2
      // long sides
      for (const xs of [-1, 1]) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(7.5, h, FIELD.L + 16), tierMat)
        step.position.set(xs * (HALF_W + off), h / 2, 0)
        step.receiveShadow = true
        this.scene.add(step)
      }
      // ends
      for (const zs of [-1, 1]) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(FIELD.W + 30, h, 7.5), tierMat)
        step.position.set(0, h / 2, zs * (HALF_L + off))
        this.scene.add(step)
      }
    }
    // crowd dots
    for (let i = 0; i < count; i++) {
      const side = i % 4
      const tier = Math.floor(Math.random() * 3)
      const h = 2 + tier * 2.4 + 0.45
      const off = 4 + tier * 4.2
      if (side < 2) {
        const xs = side === 0 ? -1 : 1
        dummy.position.set(xs * (HALF_W + off + (Math.random() - 0.5) * 4), h, (Math.random() - 0.5) * (FIELD.L + 6))
      } else {
        const zs = side === 2 ? -1 : 1
        dummy.position.set((Math.random() - 0.5) * (FIELD.W + 18), h, zs * (HALF_L + off + (Math.random() - 0.5) * 4))
      }
      dummy.rotation.y = Math.random() * 0.6
      dummy.updateMatrix()
      crowd.setMatrixAt(idx, dummy.matrix)
      color.setHex(palette[Math.floor(Math.random() * palette.length)])
      crowd.setColorAt(idx, color)
      idx++
    }
    crowd.instanceMatrix.needsUpdate = true
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true
    this.scene.add(crowd)

    // glowing rim strips around the stands
    const stripMat = new THREE.MeshBasicMaterial({ color: glowColor(0x3d8dff, 1.6), toneMapped: false })
    for (const xs of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, FIELD.L + 10), stripMat)
      strip.position.set(xs * (HALF_W + 3.4), 5.3, 0)
      this.scene.add(strip)
    }
    const stripO = new THREE.MeshBasicMaterial({ color: glowColor(0xff8a2b, 1.6), toneMapped: false })
    for (const zs of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(FIELD.W + 10, 0.16, 0.25), stripO)
      strip.position.set(0, 5.3, zs * (HALF_L + 3.4))
      this.scene.add(strip)
    }

    // light towers
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x0a1222, metalness: 0.7, roughness: 0.4 })
    const lampMat = new THREE.MeshBasicMaterial({ color: glowColor(0xeaf6ff, 2.4), toneMapped: false })
    for (const xs of [-1, 1]) {
      for (const zs of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 38, 8), towerMat)
        pole.position.set(xs * (HALF_W + 23), 19, zs * (HALF_L + 16))
        this.scene.add(pole)
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 1.2), lampMat)
        lamp.position.set(xs * (HALF_W + 23), 38, zs * (HALF_L + 16))
        this.scene.add(lamp)
      }
    }
  }

  buildCeiling() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x3f7fd0, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false })
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.W, FIELD.L), mat)
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.y = FIELD.WALL
    this.scene.add(ceiling)
    const grid = new THREE.GridHelper(FIELD.L, 24, 0x2a5f9f, 0x15304f)
    grid.position.y = FIELD.WALL - 0.1
    grid.material.transparent = true
    grid.material.opacity = 0.18
    this.scene.add(grid)
    const trim = new THREE.MeshBasicMaterial({ color: glowColor(0x2f7fff, 1.2), toneMapped: false })
    for (const xs of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, FIELD.L), trim)
      bar.position.set(xs * HALF_W, FIELD.WALL - 0.2, 0)
      this.scene.add(bar)
    }
    for (const zs of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(FIELD.W, 0.4, 0.4), trim)
      bar.position.set(0, FIELD.WALL - 0.2, zs * HALF_L)
      this.scene.add(bar)
    }
  }

  buildDust() {
    const count = 260
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * FIELD.W
      pos[i * 3 + 1] = 1 + Math.random() * (FIELD.WALL - 2)
      pos[i * 3 + 2] = (Math.random() - 0.5) * FIELD.L
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color: 0x8fc7ff, size: 0.22, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    })
    this.dust = new THREE.Points(geo, mat)
    this.scene.add(this.dust)
  }

  // ------------------------------------------------------------ entities
  buildBall() {
    const group = new THREE.Group()
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xf4f9ff, metalness: 0.15, roughness: 0.28,
      clearcoat: 1, clearcoatRoughness: 0.1,
      emissive: 0x1b4f7a, emissiveIntensity: 0.35,
    })
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), mat)
    sphere.castShadow = true
    sphere.receiveShadow = true
    group.add(sphere)

    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(R * 1.004, 1),
      new THREE.MeshBasicMaterial({ color: glowColor(0x6fe4ff, 1.3), wireframe: true, transparent: true, opacity: 0.42, toneMapped: false }),
    )
    group.add(wire)

    const ringMat = new THREE.MeshBasicMaterial({ color: glowColor(0x8fe8ff, 1.7), toneMapped: false })
    for (const rot of [[Math.PI / 2, 0, 0], [0, 0, Math.PI / 2]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.01, 0.055, 8, 64), ringMat)
      ring.rotation.set(rot[0], rot[1], rot[2])
      group.add(ring)
    }

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: 0x7fd8ff, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    glow.scale.set(12, 12, 1)
    group.add(glow)

    const light = new THREE.PointLight(0x8fd8ff, 55, 24, 2)
    group.add(light)

    group.position.set(0, R, 0)
    this.scene.add(group)
    this.ballMesh = group
  }

  buildCars() {
    this.carMeshes = []
    const teams = ['blue', 'blue', 'orange', 'orange']
    for (let i = 0; i < 4; i++) {
      const mesh = makeCarMesh(teams[i], i)
      mesh.visible = false
      this.scene.add(mesh)
      this.carMeshes.push(mesh)
    }
  }

  buildPads() {
    this.padMeshes = []
    for (let i = 0; i < 12; i++) {
      const big = i < 4
      const mesh = makePadMesh(big)
      this.scene.add(mesh)
      this.padMeshes.push(mesh)
    }
  }

  buildParticles() {
    this.sparks = new Particles(this.scene, 700, 0.62, 0.95)
    this.glowParticles = new Particles(this.scene, 320, 2.3, 0.55)
  }

  setupComposer() {
    const size = this.renderer.getSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 3, size.y / 3), 0.58, 0.7, 0.86)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.composer) {
      this.composer.setSize(w, h)
      this.bloom.resolution.set(w / 3, h / 3)
    }
  }

  // ------------------------------------------------------------ effects
  spawnBoost(car) {
    const fwdX = Math.sin(car.yaw)
    const fwdZ = Math.cos(car.yaw)
    const x = car.pos.x - fwdX * 3.3
    const z = car.pos.z - fwdZ * 3.3
    const y = car.pos.y + 0.1
    const col = Math.random() < 0.35 ? C.white : C.amber
    for (let i = 0; i < 2; i++) {
      this.sparks.spawn(
        x + (Math.random() - 0.5) * 0.7, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.7,
        -fwdX * (4 + Math.random() * 6) + (Math.random() - 0.5) * 3,
        0.6 + Math.random() * 2,
        -fwdZ * (4 + Math.random() * 6) + (Math.random() - 0.5) * 3,
        col, 0.3 + Math.random() * 0.25, 2.4, -2,
      )
    }
  }

  spawnHit(x, y, z, team, power) {
    const col = team === 'blue' ? C.ice : C.amber
    const n = Math.min(22, 5 + Math.floor(power * 0.6))
    this.sparks.burst(x, y, z, col, n, 4 + power * 0.35, 0.5, 1.5)
    this.glowParticles.spawn(x, y, z, 0, 0, 0, col, 0.3, 4, 0)
    this.shake = Math.min(0.9, this.shake + power * 0.018)
  }

  spawnBounce(x, y, z, power, surface) {
    const col = surface === 'floor' ? new THREE.Color(0x8fb8d8) : C.ice
    this.sparks.burst(x, y, z, col, Math.min(10, 2 + Math.floor(power * 0.4)), 2 + power * 0.2, 0.35, 1)
  }

  spawnPickup(x, z, big, team) {
    const col = big ? C.amber : C.white
    this.glowParticles.burst(x, 1.5, z, col, big ? 14 : 6, big ? 5 : 3, 0.5, 2)
  }

  spawnLand(x, z, power) {
    const col = new THREE.Color(0x5f86b0)
    this.sparks.burst(x, 0.4, z, col, Math.min(12, 3 + Math.floor(power * 0.4)), 2.5, 0.35, 1)
  }

  goalExplosion(team, x, y, z) {
    const col = team === 'blue' ? C.blue : C.orange
    const bright = team === 'blue' ? C.ice : C.amber
    this.sparks.burst(x, y, z, bright, 90, 20, 1.4, 4)
    this.glowParticles.burst(x, y, z, col, 40, 12, 1.2, 3)

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.16, 8, 64),
      new THREE.MeshBasicMaterial({
        color: glowColor(col, 3), transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    )
    ring.position.set(x, Math.max(y, 5), z)
    ring.lookAt(0, ring.position.y, z * 0.4)
    this.scene.add(ring)

    const shock = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({
        color: glowColor(bright, 2), wireframe: true, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    )
    shock.position.set(x, Math.max(y, 5), z)
    this.scene.add(shock)

    const light = new THREE.PointLight(col, 900, 80, 2)
    light.position.set(x, 8, z)
    this.scene.add(light)

    this.effects.push({
      t: 0, life: 1.35, ring, shock, light,
      update(dt) {
        this.t += dt
        const k = this.t / this.life
        const s = 1 + k * 20
        this.ring.scale.setScalar(s)
        this.ring.material.opacity = Math.max(0, 0.95 * (1 - k))
        this.shock.scale.setScalar(1 + k * 12)
        this.shock.material.opacity = Math.max(0, 0.5 * (1 - k * 1.3))
        this.light.intensity = Math.max(0, 900 * (1 - k * 1.6))
        if (k >= 1) {
          this.ring.parent?.remove(this.ring)
          this.shock.parent?.remove(this.shock)
          this.light.parent?.remove(this.light)
          this.ring.geometry.dispose()
          this.shock.geometry.dispose()
          this.ring.material.dispose()
          this.shock.material.dispose()
          return false
        }
        return true
      },
    })
    this.shake = 1.6
  }

  // ------------------------------------------------------------ sync
  sync(game, dt) {
    this.time += dt
    const menu = game.phase === 'menu'

    for (let i = 0; i < this.carMeshes.length; i++) {
      const car = game.cars[i]
      const mesh = this.carMeshes[i]
      mesh.visible = car.active
      if (!car.active) continue

      mesh.position.copy(car.pos)
      let extraPitch = 0
      if (car.flipTimer > 0) {
        const k = 1 - car.flipTimer / 0.42
        extraPitch = k * Math.PI * 2 * car.flipDir
      }
      mesh.rotation.set(car.pitchVis + extraPitch, car.yaw, car.rollVis, 'YXZ')

      const ud = mesh.userData
      for (const wg of ud.wheels) wg.rotation.x = car.wheelSpin
      const boostVis = car.boostingVis
      ud.flame.visible = boostVis > 0.04
      if (ud.flame.visible) {
        const flick = 0.75 + Math.random() * 0.45
        ud.flame.scale.set(0.9 + boostVis * 0.25, 0.5 + boostVis * 1.3 * flick, 0.9 + boostVis * 0.25)
        ud.boostLight.intensity = boostVis * 90
      } else {
        ud.boostLight.intensity = 0
      }
      ud.under.material.opacity = 0.16 + boostVis * 0.25
      ud.paint.emissive = new THREE.Color(TEAM_COLORS[car.team])
      ud.paint.emissiveIntensity = 0.06 + boostVis * 0.16

      if (menu) {
        mesh.position.y += Math.sin(this.time * 1.3 + i) * 0.06
      }
    }

    // ball
    this.ballMesh.position.copy(game.ball.pos)
    this.ballMesh.quaternion.copy(game.ball.quat)
    const ballSpeed = game.ball.vel.length()
    if (ballSpeed > 16 && !menu) {
      this.trailTimer -= dt
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.025
        const p = game.ball.pos
        const col = ballSpeed > 55 ? C.amber : C.ice
        this.glowParticles.spawn(
          p.x + (Math.random() - 0.5) * 2, p.y + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2,
          0, 0, 0, col, 0.34, 3, 0,
        )
      }
    }

    // pads
    for (let i = 0; i < game.pads.length; i++) {
      const pad = game.pads[i]
      const mesh = this.padMeshes[i]
      if (!mesh) continue
      mesh.visible = pad.active
      if (!pad.active) continue
      mesh.position.set(pad.x, 0, pad.z)
      mesh.userData.ring.rotation.z = pad.spin
      mesh.userData.core.rotation.y = pad.spin * 1.6
      mesh.userData.core.position.y = (pad.big ? 2.1 : 1.4) + Math.sin(this.time * 2 + i) * 0.18
    }

    this.sparks.update(dt)
    this.glowParticles.update(dt)
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (!this.effects[i].update(dt)) this.effects.splice(i, 1)
    }
    if (this.dust) this.dust.rotation.y += dt * 0.008

    this.updateCamera(game, dt)
  }

  updateCamera(game, dt) {
    const menu = game.phase === 'menu'
    const car = game.playerCar
    const ball = game.ball

    if (menu) {
      const a = this.time * 0.09
      const targetPos = new THREE.Vector3(Math.sin(a) * 88, 36 + Math.sin(this.time * 0.4) * 4, Math.cos(a) * 88)
      this.camera.position.lerp(targetPos, 1 - Math.exp(-2.4 * dt))
      this.camLook.lerp(new THREE.Vector3(0, 5, 0), 1 - Math.exp(-3 * dt))
      this.camera.lookAt(this.camLook)
      this.camera.fov = 58
      this.camera.updateProjectionMatrix()
      return
    }

    if (game.phase === 'goal' && game.lastGoal) {
      const zs = Math.sign(game.lastGoal.team === 'blue' ? HALF_L : -HALF_L)
      const targetPos = new THREE.Vector3(
        clamp(ball.pos.x * 0.55, -18, 18),
        13 + Math.sin(this.time * 0.8) * 1.5,
        zs * (HALF_L - 30),
      )
      this.camera.position.lerp(targetPos, 1 - Math.exp(-4.5 * dt))
      this.camLook.lerp(new THREE.Vector3(ball.pos.x * 0.6, Math.max(5, ball.pos.y), zs * HALF_L), 1 - Math.exp(-6 * dt))
      this.camera.lookAt(this.camLook)
      this.camera.fov = 60
      this.camera.updateProjectionMatrix()
      this.applyShake(dt)
      return
    }

    const fwdX = Math.sin(car.yaw)
    const fwdZ = Math.cos(car.yaw)
    const speed = car.vel.length()
    const wide = clamp((this.camera.aspect - 1.35) / 0.85, 0, 1)
    const dist = 20 + speed * 0.09 + wide * 5.5

    this.camMode += ((this.ballCam ? 1 : 0) - this.camMode) * Math.min(1, 7 * dt)

    // Ball cam swings the chase camera around the car so the ball stays in view,
    // including when it is behind you. Without this the ball can sit off-screen.
    const toBallX = ball.pos.x - car.pos.x
    const toBallZ = ball.pos.z - car.pos.z
    const ballDist = Math.hypot(toBallX, toBallZ)
    const toBallYaw = ballDist > 3 ? Math.atan2(toBallX, toBallZ) : car.yaw
    const camYaw = car.yaw + wrapAngle(toBallYaw - car.yaw) * 0.68 * this.camMode
    const camFwdX = Math.sin(camYaw)
    const camFwdZ = Math.cos(camYaw)

    const rawCamX = car.pos.x - camFwdX * dist
    const rawCamZ = car.pos.z - camFwdZ * dist
    let camX = clamp(rawCamX, -HALF_W + 2, HALF_W - 2)
    let camZ = clamp(rawCamZ, -HALF_L + 2, HALF_L - 2)
    let camDist = Math.hypot(camX - car.pos.x, camZ - car.pos.z)

    // Near a wall the chase camera gets squeezed against the arena bounds.
    // Slide it along the wall (picking the roomier side) instead of clipping
    // through the car, then lift it a little if it is still too close.
    if (camDist < dist - 1) {
      const miss = (dist - camDist) * 0.9
      const tx = -camFwdZ
      const tz = camFwdX
      const side = (s) => {
        const x = clamp(camX + tx * miss * s, -HALF_W + 2, HALF_W - 2)
        const z = clamp(camZ + tz * miss * s, -HALF_L + 2, HALF_L - 2)
        return { x, z, d: Math.hypot(x - car.pos.x, z - car.pos.z) }
      }
      const a = side(1)
      const b = side(-1)
      const best = a.d >= b.d ? a : b
      camX = best.x
      camZ = best.z
      camDist = best.d
    }

    const desired = new THREE.Vector3(
      camX,
      car.pos.y + 8.4 + wide * 4.2 + Math.max(0, car.pos.y - CAR.groundY) * 0.25,
      camZ,
    )
    desired.y += Math.max(0, dist - camDist) * 0.8
    desired.y = Math.max(desired.y, 2.6)

    const follow = 1 - Math.exp(-7.5 * dt)
    this.camera.position.lerp(desired, follow)

    const wallSlide = clamp(Math.hypot(camX - rawCamX, camZ - rawCamZ) / 14, 0, 1)
    const lookAhead = 10 - wallSlide * 7
    const carLook = new THREE.Vector3(car.pos.x + fwdX * lookAhead, car.pos.y + 2.4, car.pos.z + fwdZ * lookAhead)
    const ballLook = new THREE.Vector3(ball.pos.x, Math.max(ball.pos.y, 3.6), ball.pos.z)
    const look = carLook.lerp(ballLook, this.camMode * (0.66 - wide * 0.12) * (1 - wallSlide * 0.45))
    this.camLook.lerp(look, 1 - Math.exp(-9 * dt))
    this.camera.lookAt(this.camLook)

    const targetFov = 61 + Math.min(14, speed * 0.15) + car.boostingVis * 5
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 4 * dt)
    this.camera.updateProjectionMatrix()
    this.applyShake(dt)
  }

  applyShake(dt) {
    if (this.shake > 0.001) {
      const s = this.shake
      this.camera.position.x += (Math.random() - 0.5) * s
      this.camera.position.y += (Math.random() - 0.5) * s
      this.camera.position.z += (Math.random() - 0.5) * s
      this.shake = Math.max(0, this.shake - dt * 2.4)
    }
  }

  render() {
    this.composer.render()
  }

  debugRay(x, y) {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(x, y), this.camera)
    return ray.intersectObjects(this.scene.children, true).slice(0, 6).map((h) => ({
      distance: +h.distance.toFixed(2),
      type: h.object.type,
      geometry: h.object.geometry?.type,
      parent: h.object.parent?.type,
      point: h.point.toArray().map((v) => +v.toFixed(2)),
      rootIndex: this.scene.children.indexOf(h.object.parent),
    }))
  }
}
