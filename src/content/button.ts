import styles from './styles.css?inline'

// Inline SVG (no icon library in the content script — keeps the payload tiny).
const SPARKLE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">' +
  '<path d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9L12 2z" fill="currentColor"/>' +
  '<path d="M19 3l.6 2.1L22 6l-2.4.9L19 9l-.6-2.1L16 6l2.4-.9L19 3z" fill="currentColor" opacity="0.7"/>' +
  '</svg>'

export type ButtonState = 'default' | 'loading' | 'error'

/**
 * A single floating "Write with AI" pill rendered inside a Shadow DOM and
 * positioned next to whichever comment input is currently active.
 */
export class InlineButton {
  private readonly host: HTMLDivElement
  private readonly pill: HTMLButtonElement
  private readonly iconEl: HTMLSpanElement
  private readonly labelEl: HTMLSpanElement
  private readonly tooltip: HTMLDivElement
  private target: HTMLElement | null = null
  private clickHandler: (() => void) | null = null
  private state: ButtonState = 'default'
  private tooltipTimer: number | null = null
  private successTimer: number | null = null
  private readonly reposition = (): void => this.position()

  constructor() {
    this.host = document.createElement('div')
    this.host.setAttribute('data-inlineai-host', '')
    this.host.style.cssText =
      'position:fixed;z-index:2147483600;top:0;left:0;display:none;margin:0;padding:0;'

    const root = this.host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = styles

    const wrap = document.createElement('div')
    wrap.className = 'wrap'

    this.pill = document.createElement('button')
    this.pill.className = 'pill'
    this.pill.type = 'button'
    this.pill.setAttribute('data-state', 'default')
    this.pill.setAttribute('aria-label', 'Write a comment with AI (Alt+Shift+W)')
    this.pill.setAttribute('aria-keyshortcuts', 'Alt+Shift+W')
    this.pill.title = 'Write with AI (Alt+Shift+W)'

    this.iconEl = document.createElement('span')
    this.iconEl.className = 'icon'
    this.iconEl.innerHTML = SPARKLE_SVG

    this.labelEl = document.createElement('span')
    this.labelEl.className = 'label'
    this.labelEl.textContent = 'Write with AI'

    this.tooltip = document.createElement('div')
    this.tooltip.className = 'tooltip'
    this.tooltip.setAttribute('role', 'status')

    this.pill.append(this.iconEl, this.labelEl)
    wrap.append(this.pill, this.tooltip)
    root.append(style, wrap)
    document.body.appendChild(this.host)

    // Keep the comment input focused when the pill is pressed.
    this.pill.addEventListener('mousedown', (e) => e.preventDefault())
    this.pill.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.clickHandler?.()
    })
  }

  onClick(handler: () => void): void {
    this.clickHandler = handler
  }

  attachTo(target: HTMLElement, isDark: boolean): void {
    // Remove first so repeated focus events never stack duplicate listeners.
    window.removeEventListener('scroll', this.reposition, true)
    window.removeEventListener('resize', this.reposition)
    this.target = target
    this.setTheme(isDark)
    this.host.style.display = 'block'
    this.position()
    requestAnimationFrame(() => this.pill.classList.add('enter'))
    window.addEventListener('scroll', this.reposition, true)
    window.addEventListener('resize', this.reposition)
  }

  hide(): void {
    this.host.style.display = 'none'
    this.pill.classList.remove('enter')
    this.target = null
    window.removeEventListener('scroll', this.reposition, true)
    window.removeEventListener('resize', this.reposition)
    this.clearTooltip()
  }

  destroy(): void {
    window.removeEventListener('scroll', this.reposition, true)
    window.removeEventListener('resize', this.reposition)
    this.clearTooltip()
    if (this.successTimer) clearTimeout(this.successTimer)
    this.host.remove()
  }

  contains(node: Node | null): boolean {
    return node != null && this.host.contains(node)
  }

  isVisible(): boolean {
    return this.host.style.display !== 'none'
  }

  getTarget(): HTMLElement | null {
    return this.target
  }

  getState(): ButtonState {
    return this.state
  }

  setTheme(isDark: boolean): void {
    this.host.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }

  setState(state: ButtonState): void {
    this.state = state
    this.pill.setAttribute('data-state', state)
    if (state === 'loading') {
      this.iconEl.innerHTML = '<span class="spinner"></span>'
      this.labelEl.textContent = 'Writing…'
    } else {
      this.iconEl.innerHTML = SPARKLE_SVG
      this.labelEl.textContent = 'Write with AI'
    }
  }

  showError(message: string): void {
    this.setState('error')
    this.pill.classList.remove('shake')
    // Force reflow so the animation can replay.
    void this.pill.offsetWidth
    this.pill.classList.add('shake')
    this.tooltip.textContent = message
    this.tooltip.classList.add('show')
    this.clearTooltipTimer()
    this.tooltipTimer = window.setTimeout(() => {
      this.tooltip.classList.remove('show')
      if (this.state === 'error') this.setState('default')
    }, 4000)
  }

  showInfo(message: string, ms = 3000): void {
    this.tooltip.textContent = message
    this.tooltip.classList.add('show')
    this.clearTooltipTimer()
    this.tooltipTimer = window.setTimeout(() => this.tooltip.classList.remove('show'), ms)
  }

  flashSuccess(): void {
    if (this.successTimer) clearTimeout(this.successTimer)
    this.successTimer = window.setTimeout(() => this.setState('default'), 300)
  }

  private position(): void {
    if (!this.target) return
    const r = this.target.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) {
      // Never drop the target mid-generation: the pill is the only cancel control.
      if (this.state !== 'loading') this.hide()
      return
    }
    const pillRect = this.pill.getBoundingClientRect()
    const pw = pillRect.width || 120
    const ph = pillRect.height || 28
    let left = r.right - pw - 10
    let top = r.top + 6
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - ph - 8))
    this.host.style.left = `${left}px`
    this.host.style.top = `${top}px`
  }

  private clearTooltipTimer(): void {
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer)
      this.tooltipTimer = null
    }
  }

  private clearTooltip(): void {
    this.clearTooltipTimer()
    this.tooltip.classList.remove('show')
  }
}
