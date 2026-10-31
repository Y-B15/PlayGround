import { Game } from './game.js'
import { World } from './world.js'
import { Input } from './input.js'
import { Sound } from './audio.js'
import { DIFFICULTY } from './constants.js'

const $ = (id) => document.getElementById(id)
const canvas = $('game')
const hud = $('hud')
const menu = $('menu')
const pauseMenu = $('pauseMenu')
const resultModal = $('result')
const rotate = $('rotate')
const loading = $('loading')

const game = new Game()
const world = new World(canvas)
const audio = new Sound()

const saved = (() => {
  try { return JSON.parse(localStorage.getItem('rocket-rivals-settings') || '{}') } catch { return {} }
})()

const settings = {
  mode: saved.mode === '2v2' ? '2v2' : '1v1',
  difficulty: ['rookie', 'pro', 'allstar'].includes(saved.difficulty) ? saved.difficulty : 'pro',
  duration: [120, 180, 300].includes(saved.duration) ? saved.duration : 180,
}
let muted = !!saved.muted

const input = new Input({
  onCam: toggleCamera,
  onPause: togglePause,
})

let lastTime = performance.now()
let accumulator = 0
let resultTimer = null
let matchStarted = false

// ---------------------------------------------------------------- settings UI
function syncSegments() {
  const setActive = (segId, value) => {
    const seg = $(segId)
    if (!seg) return
    for (const b of seg.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.value === String(value))
    }
  }
  setActive('modeSeg', settings.mode)
  setActive('diffSeg', settings.difficulty)
  setActive('timeSeg', settings.duration)
}

for (const [segId, key] of [['modeSeg', 'mode'], ['diffSeg', 'difficulty'], ['timeSeg', 'duration']]) {
  const seg = $(segId)
  seg?.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    settings[key] = key === 'duration' ? Number(btn.dataset.value) : btn.dataset.value
    localStorage.setItem('rocket-rivals-settings', JSON.stringify({ ...settings, muted }))
    syncSegments()
    audio.ui()
  })
}
syncSegments()

function toggleCamera() {
  world.ballCam = !world.ballCam
  $('camBtn')?.classList.toggle('active', world.ballCam)
  audio.ui()
  haptic(8)
}
$('camBtn')?.classList.add('active')

function haptic(ms = 15) {
  try { navigator.vibrate?.(ms) } catch { /* noop */ }
}

// ---------------------------------------------------------------- match flow
function startMatch() {
  audio.init()
  audio.setMuted(muted)
  updateMuteIcon()
  input.reset()
  game.startMatch({ ...settings })
  menu.classList.add('hidden')
  resultModal.classList.add('hidden')
  pauseMenu.classList.add('hidden')
  hud.classList.remove('hidden')
  matchStarted = true
  accumulator = 0
  lastTime = performance.now()
  clearTimeout(resultTimer)
  if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {})
  }
  audio.ui()
}

function toMenu() {
  game.toMenu()
  hud.classList.add('hidden')
  pauseMenu.classList.add('hidden')
  resultModal.classList.add('hidden')
  menu.classList.remove('hidden')
  matchStarted = false
  audio.setEngine(0, false, false)
  audio.setCrowd(0)
  clearTimeout(resultTimer)
}

function togglePause() {
  if (game.phase === 'paused') {
    game.resume()
    pauseMenu.classList.add('hidden')
    audio.ui()
  } else if (game.pause()) {
    pauseMenu.classList.remove('hidden')
    input.reset()
    audio.setEngine(0, false, false)
    audio.setCrowd(0)
    audio.ui()
  }
}

$('playBtn')?.addEventListener('click', startMatch)
$('pauseBtn')?.addEventListener('click', togglePause)
$('resumeBtn')?.addEventListener('click', togglePause)
$('restartBtn')?.addEventListener('click', () => { pauseMenu.classList.add('hidden'); startMatch() })
$('quitBtn')?.addEventListener('click', toMenu)
$('rematchBtn')?.addEventListener('click', startMatch)
$('menuBtn')?.addEventListener('click', toMenu)
$('muteBtn')?.addEventListener('click', () => {
  muted = !muted
  audio.init()
  audio.setMuted(muted)
  updateMuteIcon()
  localStorage.setItem('rocket-rivals-settings', JSON.stringify({ ...settings, muted }))
})

function updateMuteIcon() {
  const btn = $('muteBtn')
  if (btn) btn.textContent = muted ? '🔇' : '🔊'
}
updateMuteIcon()

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === 'play') togglePause()
})

// ---------------------------------------------------------------- HUD helpers
let lastScore = { blue: -1, orange: -1 }
let lastTimerText = ''
let lastBoost = -1
let lastSpeed = -1

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function updateHud() {
  const blueScore = $('blueScore')
  const orangeScore = $('orangeScore')
  if (game.score.blue !== lastScore.blue) {
    blueScore.textContent = game.score.blue
    if (lastScore.blue >= 0) pop(blueScore)
    lastScore.blue = game.score.blue
  }
  if (game.score.orange !== lastScore.orange) {
    orangeScore.textContent = game.score.orange
    if (lastScore.orange >= 0) pop(orangeScore)
    lastScore.orange = game.score.orange
  }

  const timerText = formatTime(game.timer)
  if (timerText !== lastTimerText) {
    const el = $('timer')
    el.textContent = timerText
    el.classList.toggle('warn', !game.overtime && game.timer <= 30 && game.phase === 'play')
    lastTimerText = timerText
  }
  $('overtime').classList.toggle('hidden', !game.overtime)

  const boost = Math.round(game.playerCar.boost)
  if (boost !== lastBoost) {
    lastBoost = boost
    $('boostFill').style.width = `${boost}%`
    const btn = $('boostBtn')
    if (btn) {
      btn.style.setProperty('--boost', `${boost}%`)
      btn.classList.toggle('low', boost < 12)
    }
  }
  const kmh = Math.round(game.playerCar.vel.length() * 3.6)
  if (kmh !== lastSpeed) {
    lastSpeed = kmh
    $('speed').innerHTML = `${kmh} <small>KM/H</small>`
  }

  const active = game.phase === 'play' || game.phase === 'countdown'
  audio.setEngine(game.playerCar.vel.length(), game.playerCar.boosting, active)
  audio.setCrowd(game.phase === 'play' ? 0.014 : game.phase === 'goal' ? 0.05 : 0)
}

function pop(el) {
  el.classList.remove('pop')
  void el.offsetWidth
  el.classList.add('pop')
}

function flashCountdown(text, go = false) {
  const el = $('countdown')
  el.textContent = text
  el.className = 'countdown'
  void el.offsetWidth
  el.classList.add('show')
  if (go) el.classList.add('go')
}

function goalBanner(team) {
  const el = $('goalBanner')
  el.textContent = team === 'blue' ? 'BLUE SCORES' : 'ORANGE SCORES'
  el.className = 'goal-banner'
  void el.offsetWidth
  el.classList.add(team, 'show')
}

function feed(text) {
  const box = $('feed')
  const item = document.createElement('div')
  item.className = 'item'
  item.textContent = text
  box.appendChild(item)
  setTimeout(() => item.remove(), 2800)
  while (box.children.length > 3) box.firstChild.remove()
}

// ---------------------------------------------------------------- events
function handleEvents() {
  for (const e of game.events) {
    switch (e.type) {
      case 'start':
        lastScore = { blue: -1, orange: -1 }
        lastTimerText = ''
        lastBoost = -1
        lastSpeed = -1
        break
      case 'countdown':
        flashCountdown(String(e.value))
        audio.countdown(e.value)
        break
      case 'go':
        flashCountdown('GO!', true)
        audio.go()
        haptic(18)
        break
      case 'hit': {
        audio.hit(e.power)
        world.spawnHit(e.x, e.y, e.z, e.team, e.power)
        if (e.team === 'blue') haptic(Math.min(35, 8 + e.power * 0.5))
        break
      }
      case 'bounce':
        audio.bounce(e.power)
        world.spawnBounce(e.x, e.y, e.z, e.power, e.surface)
        break
      case 'post':
        audio.post()
        world.spawnBounce(e.x, e.y, e.z, e.power, 'post')
        break
      case 'carBump':
        audio.bounce(e.power * 0.6)
        world.spawnBounce(e.x, e.y, e.z, e.power * 0.7, 'wall')
        break
      case 'jump':
        if (e.car === game.playerCar) audio.jump()
        break
      case 'flip':
        if (e.car === game.playerCar) { audio.flip(); haptic(12) }
        break
      case 'land':
        world.spawnLand(e.car.pos.x, e.car.pos.z, e.power)
        break
      case 'boostParticle':
        world.spawnBoost(e.car)
        break
      case 'pickup':
        audio.pickup(e.big)
        world.spawnPickup(e.x, e.z, e.big, e.team)
        break
      case 'goal':
        goalBanner(e.team)
        feed(`⚽ GOAL — ${e.team === 'blue' ? 'BLUE' : 'ORANGE'}`)
        world.goalExplosion(e.team, e.x, e.y, e.z)
        audio.goal(e.team)
        haptic([40, 40, 80])
        break
      case 'overtime':
        feed('⏱ OVERTIME — NEXT GOAL WINS')
        audio.overtime()
        break
      case 'end':
        onEnd(e)
        break
      default:
        break
    }
  }
  game.events.length = 0
}

function onEnd(e) {
  audio.setEngine(0, false, false)
  audio.setCrowd(0)
  const title = $('resultTitle')
  const kicker = $('resultKicker')
  $('resBlue').textContent = e.blue
  $('resOrange').textContent = e.orange
  if (e.winner === 'blue') {
    title.textContent = 'BLUE WINS'
    title.style.color = '#8fd0ff'
    title.style.textShadow = '0 0 32px rgba(70,150,255,0.7)'
    audio.win()
  } else if (e.winner === 'orange') {
    title.textContent = 'ORANGE WINS'
    title.style.color = '#ffbd7a'
    title.style.textShadow = '0 0 32px rgba(255,140,50,0.7)'
    audio.lose()
  } else {
    title.textContent = 'DRAW'
    title.style.color = '#eaf5ff'
    audio.lose()
  }
  kicker.textContent = e.overtime ? 'OVERTIME WINNER' : 'FULL TIME'
  const diff = DIFFICULTY[settings.difficulty]?.label || settings.difficulty
  $('resultStats').innerHTML = `<span>${settings.mode.toUpperCase()} · ${diff}</span><span>${game.matchStats.hits} HITS</span><span>${Math.round(game.matchStats.boostUsed)} BOOST</span>`
  clearTimeout(resultTimer)
  resultTimer = setTimeout(() => {
    if (game.phase === 'ended') resultModal.classList.remove('hidden')
  }, 1100)
}

// ---------------------------------------------------------------- loop
function frame(now) {
  const raw = (now - lastTime) / 1000
  lastTime = now
  const dt = Math.min(0.1, Math.max(0.0001, raw))
  const step = 1 / 60
  accumulator = Math.min(accumulator + dt, 0.25)
  let first = true
  let steps = 0
  while (accumulator >= step && steps < 12) {
    game.update(step, input.snapshot(first))
    accumulator -= step
    first = false
    steps++
  }
  if (steps > 0) input.clearJump()

  world.sync(game, dt)
  world.render()
  handleEvents()
  updateHud()

  requestAnimationFrame(frame)
}

// ---------------------------------------------------------------- resize / orientation
let resizeTimer = null
function onResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => world.resize(), 90)
}
window.addEventListener('resize', onResize)
window.addEventListener('orientationchange', () => setTimeout(() => world.resize(), 220))
const portraitQuery = matchMedia('(orientation: portrait)')
portraitQuery.addEventListener?.('change', (e) => {
  world.resize()
  if (e.matches && game.phase === 'play') togglePause()
})

// ---------------------------------------------------------------- boot
world.resize()
world.render()
syncSegments()

setTimeout(() => {
  loading.classList.add('done')
  setTimeout(() => loading.remove(), 600)
}, 450)

requestAnimationFrame((t) => {
  lastTime = t
  frame(t)
})

// expose for quick debugging in the console
window.__rocket = { game, world, settings }
