export class Sound {
  constructor() {
    this.ctx = null
    this.master = null
    this.muted = false
    this.engineGain = null
    this.engineFilter = null
    this.engineOscs = []
    this.boostGain = null
    this.crowdGain = null
    this.noiseBuffer = null
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.7
    this.master.connect(this.ctx.destination)
    this.noiseBuffer = this.makeNoise(2)
    this.buildEngine()
    this.buildBoost()
    this.buildCrowd()
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate
    const buffer = this.ctx.createBuffer(1, rate * seconds, rate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  buildEngine() {
    const ctx = this.ctx
    this.engineFilter = ctx.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 380
    this.engineFilter.Q.value = 3
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0
    this.engineFilter.connect(this.engineGain)
    this.engineGain.connect(this.master)
    const specs = [
      { type: 'sawtooth', detune: 0, gain: 0.6 },
      { type: 'square', detune: 7, gain: 0.25 },
    ]
    for (const s of specs) {
      const osc = ctx.createOscillator()
      osc.type = s.type
      osc.frequency.value = 55
      osc.detune.value = s.detune
      const g = ctx.createGain()
      g.gain.value = s.gain
      osc.connect(g)
      g.connect(this.engineFilter)
      osc.start()
      this.engineOscs.push({ osc, base: 55 })
    }
  }

  buildBoost() {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900
    filter.Q.value = 0.7
    this.boostGain = ctx.createGain()
    this.boostGain.gain.value = 0
    src.connect(filter)
    filter.connect(this.boostGain)
    this.boostGain.connect(this.master)
    src.start()
  }

  buildCrowd() {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    this.crowdGain = ctx.createGain()
    this.crowdGain.gain.value = 0
    src.connect(filter)
    filter.connect(this.crowdGain)
    this.crowdGain.connect(this.master)
    src.start()
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) {
      const t = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(t)
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.7, t + 0.08)
    }
  }

  setEngine(speed, boosting, active) {
    if (!this.ctx || !this.engineGain) return
    const t = this.ctx.currentTime
    const freq = 48 + Math.min(90, speed * 2.3) + (boosting ? 12 : 0)
    for (const e of this.engineOscs) {
      e.osc.frequency.setTargetAtTime(freq, t, 0.05)
    }
    this.engineFilter.frequency.setTargetAtTime(300 + Math.min(1400, speed * 26), t, 0.06)
    const target = active ? 0.035 + Math.min(0.045, speed * 0.0009) : 0
    this.engineGain.gain.setTargetAtTime(target, t, 0.08)
    if (this.boostGain) this.boostGain.gain.setTargetAtTime(active && boosting ? 0.16 : 0, t, 0.05)
  }

  setCrowd(level) {
    if (!this.crowdGain) return
    this.crowdGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.2)
  }

  tone({ freq = 440, to = null, dur = 0.2, type = 'sine', gain = 0.2, delay = 0, filter = null }) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    let node = osc
    if (filter) {
      const f = ctx.createBiquadFilter()
      f.type = filter.type || 'lowpass'
      f.frequency.value = filter.freq || 800
      f.Q.value = filter.q || 1
      node.connect(f)
      node = f
    }
    node.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  noiseBurst({ dur = 0.25, freq = 700, q = 0.9, gain = 0.2, type = 'bandpass', delay = 0 }) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t0 = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.playbackRate.value = 0.8 + Math.random() * 0.5
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.master)
    src.start(t0, Math.random() * 0.5)
    src.stop(t0 + dur + 0.05)
  }

  hit(power) {
    const p = Math.min(1.4, power / 30)
    this.tone({ freq: 120 - p * 30, to: 48, dur: 0.22, type: 'sine', gain: 0.22 + p * 0.2 })
    this.noiseBurst({ dur: 0.16, freq: 900 + p * 900, q: 1.2, gain: 0.1 + p * 0.14 })
    if (p > 0.8) this.tone({ freq: 260, to: 110, dur: 0.18, type: 'triangle', gain: 0.12 })
  }

  bounce(power) {
    const p = Math.min(1, power / 40)
    this.tone({ freq: 170, to: 70, dur: 0.16, type: 'sine', gain: 0.08 + p * 0.12 })
    this.noiseBurst({ dur: 0.1, freq: 500, gain: 0.04 + p * 0.05 })
  }

  post() {
    this.tone({ freq: 1100, to: 720, dur: 0.5, type: 'triangle', gain: 0.18 })
    this.tone({ freq: 1650, dur: 0.35, type: 'sine', gain: 0.08 })
  }

  jump() {
    this.noiseBurst({ dur: 0.18, freq: 1400, q: 0.6, gain: 0.09, type: 'highpass' })
    this.tone({ freq: 240, to: 420, dur: 0.12, type: 'sine', gain: 0.07 })
  }

  flip() {
    this.noiseBurst({ dur: 0.22, freq: 1800, q: 0.7, gain: 0.11, type: 'highpass' })
    this.tone({ freq: 300, to: 700, dur: 0.14, type: 'sawtooth', gain: 0.05 })
  }

  pickup(big) {
    this.tone({ freq: big ? 520 : 700, dur: 0.09, type: 'square', gain: big ? 0.12 : 0.06 })
    if (big) this.tone({ freq: 780, dur: 0.12, type: 'square', gain: 0.1, delay: 0.07 })
    this.tone({ freq: big ? 1040 : 980, dur: 0.1, type: 'sine', gain: 0.05, delay: big ? 0.14 : 0.04 })
  }

  countdown(n) {
    this.tone({ freq: n > 0 ? 620 : 880, dur: 0.14, type: 'square', gain: 0.12 })
    if (n > 0) this.tone({ freq: n > 0 ? 620 : 880, dur: 0.1, type: 'sine', gain: 0.08 })
  }

  go() {
    this.tone({ freq: 880, dur: 0.28, type: 'square', gain: 0.13 })
    this.tone({ freq: 1320, dur: 0.4, type: 'sine', gain: 0.1, delay: 0.04 })
  }

  goal(team) {
    const root = team === 'blue' ? 220 : 196
    const notes = [1, 1.26, 1.5, 2]
    notes.forEach((n, i) => {
      this.tone({ freq: root * n, dur: 1.5, type: 'sawtooth', gain: 0.075, delay: i * 0.06, filter: { type: 'lowpass', freq: 1500 } })
      this.tone({ freq: root * n * 2, dur: 1.2, type: 'triangle', gain: 0.035, delay: i * 0.06 })
    })
    this.noiseBurst({ dur: 2.2, freq: 1100, q: 0.4, gain: 0.1, type: 'bandpass', delay: 0.05 })
    this.tone({ freq: 90, to: 50, dur: 0.9, type: 'sine', gain: 0.2 })
  }

  overtime() {
    this.tone({ freq: 330, dur: 0.25, type: 'square', gain: 0.1 })
    this.tone({ freq: 440, dur: 0.4, type: 'square', gain: 0.1, delay: 0.2 })
  }

  win() {
    ;[523, 659, 784, 1046].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.11, delay: i * 0.12 })
    })
  }

  lose() {
    ;[392, 330, 262].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.5, type: 'sine', gain: 0.09, delay: i * 0.16 })
    })
  }

  ui() {
    this.tone({ freq: 760, dur: 0.05, type: 'sine', gain: 0.05 })
  }
}
