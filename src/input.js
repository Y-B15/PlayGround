export class Input {
  constructor({ onCam, onPause }) {
    this.onCam = onCam
    this.onPause = onPause
    this.steer = 0
    this.throttle = 0
    this.boost = false
    this.jumpPressed = false
    this.jumpHeld = false
    this.keys = new Set()
    this.stickPointer = null
    this.stickRadius = 46
    this.enabled = true

    this.stick = document.getElementById('stick')
    this.knob = document.getElementById('stickKnob')
    this.boostBtn = document.getElementById('boostBtn')
    this.jumpBtn = document.getElementById('jumpBtn')
    this.camBtn = document.getElementById('camBtn')

    this.bindStick()
    this.bindButton(this.boostBtn, {
      down: () => { this.boost = true; this.boostBtn.classList.add('pressed') },
      up: () => { this.boost = false; this.boostBtn.classList.remove('pressed') },
    })
    this.bindButton(this.jumpBtn, {
      down: () => {
        this.jumpPressed = true
        this.jumpHeld = true
        this.jumpBtn.classList.add('pressed')
      },
      up: () => {
        this.jumpHeld = false
        this.jumpBtn.classList.remove('pressed')
      },
    })
    if (this.camBtn) {
      this.camBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        this.onCam?.()
      })
    }

    window.addEventListener('keydown', (e) => this.onKeyDown(e))
    window.addEventListener('keyup', (e) => this.onKeyUp(e))
    window.addEventListener('blur', () => this.reset())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset()
    })
  }

  bindStick() {
    if (!this.stick) return
    const start = (e) => {
      if (!this.enabled) return
      e.preventDefault()
      this.stickPointer = e.pointerId
      this.stick.setPointerCapture?.(e.pointerId)
      this.updateStick(e)
    }
    const move = (e) => {
      if (e.pointerId !== this.stickPointer) return
      e.preventDefault()
      this.updateStick(e)
    }
    const end = (e) => {
      if (e.pointerId !== this.stickPointer) return
      this.stickPointer = null
      this.steer = 0
      this.throttle = 0
      this.knob.style.transform = 'translate(0px, 0px)'
    }
    this.stick.addEventListener('pointerdown', start)
    this.stick.addEventListener('pointermove', move)
    this.stick.addEventListener('pointerup', end)
    this.stick.addEventListener('pointercancel', end)
    this.stick.addEventListener('lostpointercapture', end)
  }

  updateStick(e) {
    const rect = this.stick.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let dx = e.clientX - cx
    let dy = e.clientY - cy
    const d = Math.hypot(dx, dy)
    const max = Math.min(this.stickRadius, rect.width * 0.34)
    if (d > max) {
      dx = (dx / d) * max
      dy = (dy / d) * max
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`
    const nx = dx / max
    const ny = dy / max
    const dead = 0.1
    this.steer = Math.abs(nx) < dead ? 0 : nx
    this.throttle = Math.abs(ny) < dead ? 0 : -ny
  }

  bindButton(el, { down, up }) {
    if (!el) return
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return
      e.preventDefault()
      el.setPointerCapture?.(e.pointerId)
      down()
    })
    const release = (e) => {
      e.preventDefault?.()
      up()
    }
    el.addEventListener('pointerup', release)
    el.addEventListener('pointercancel', release)
    el.addEventListener('lostpointercapture', release)
  }

  onKeyDown(e) {
    const code = e.code
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code)) {
      e.preventDefault()
    }
    if (e.repeat) return
    this.keys.add(code)
    if (code === 'Space') {
      this.jumpPressed = true
      this.jumpHeld = true
    }
    if (code === 'KeyC') this.onCam?.()
    if (code === 'Escape' || code === 'KeyP') this.onPause?.()
  }

  onKeyUp(e) {
    this.keys.delete(e.code)
    if (e.code === 'Space') this.jumpHeld = false
  }

  snapshot(includeJump = true) {
    let throttle = this.throttle
    let steer = this.steer
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) throttle = 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) throttle = -1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steer = 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steer = -1
    return {
      throttle,
      steer,
      boost: this.boost || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      jumpPressed: includeJump && this.jumpPressed,
      jumpHeld: this.jumpHeld || this.keys.has('Space'),
    }
  }

  clearJump() {
    this.jumpPressed = false
  }

  reset() {
    this.steer = 0
    this.throttle = 0
    this.boost = false
    this.jumpPressed = false
    this.jumpHeld = false
    this.keys.clear()
    if (this.knob) this.knob.style.transform = 'translate(0px, 0px)'
    this.boostBtn?.classList.remove('pressed')
    this.jumpBtn?.classList.remove('pressed')
  }
}
