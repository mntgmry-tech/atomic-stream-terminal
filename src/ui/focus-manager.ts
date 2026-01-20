import blessed from "blessed"

type FocusTarget<T extends string> = {
  id: T
  element: blessed.Widgets.BoxElement
  enabled: boolean
}

type FocusableWithRows = blessed.Widgets.BoxElement & {
  rows?: blessed.Widgets.ListElement
}

export class FocusManager<T extends string> {
  private screen: blessed.Widgets.Screen
  private focusTargets: Array<FocusTarget<T>> = []
  private currentIndex = 0
  private currentId: T | null = null
  private elementToId = new Map<blessed.Widgets.BoxElement, T>()

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen
  }

  register(id: T, element: blessed.Widgets.BoxElement): void {
    this.focusTargets.push({ id, element, enabled: true })
    this.elementToId.set(element, id)
    this.bindFocusListener(element, id)

    const withRows = element as FocusableWithRows
    if (withRows.rows) {
      this.elementToId.set(withRows.rows, id)
      this.bindFocusListener(withRows.rows, id)
    }

    if (this.currentId === null) {
      this.currentId = id
      this.currentIndex = this.focusTargets.length - 1
    }
  }

  unregister(id: T): void {
    const index = this.focusTargets.findIndex((target) => target.id === id)
    if (index === -1) return
    const [target] = this.focusTargets.splice(index, 1)
    if (target) {
      this.elementToId.delete(target.element)
    }
    if (this.currentIndex >= this.focusTargets.length) {
      this.currentIndex = Math.max(0, this.focusTargets.length - 1)
      this.currentId = this.focusTargets[this.currentIndex]?.id ?? null
    }
  }

  setEnabled(id: T, enabled: boolean): void {
    const target = this.focusTargets.find((item) => item.id === id)
    if (!target) return
    target.enabled = enabled
    if (!enabled && this.currentId === id) {
      this.focusNext()
    }
  }

  focusById(id: T): void {
    const index = this.focusTargets.findIndex((target) => target.id === id)
    if (index === -1) return
    const target = this.focusTargets[index]
    if (!target || !this.isFocusable(target)) return
    this.currentIndex = index
    this.currentId = id
    target.element.focus()
    this.screen.render()
  }

  focusNext(): void {
    if (this.focusTargets.length === 0) return

    const startIndex = this.currentIndex
    let nextIndex = this.currentIndex

    do {
      nextIndex = (nextIndex + 1) % this.focusTargets.length
      const target = this.focusTargets[nextIndex]
      if (target && this.isFocusable(target)) {
        this.currentIndex = nextIndex
        this.currentId = target.id
        target.element.focus()
        this.screen.render()
        return
      }
    } while (nextIndex !== startIndex)
  }

  focusPrevious(): void {
    if (this.focusTargets.length === 0) return

    const startIndex = this.currentIndex
    let nextIndex = this.currentIndex

    do {
      nextIndex = (nextIndex - 1 + this.focusTargets.length) % this.focusTargets.length
      const target = this.focusTargets[nextIndex]
      if (target && this.isFocusable(target)) {
        this.currentIndex = nextIndex
        this.currentId = target.id
        target.element.focus()
        this.screen.render()
        return
      }
    } while (nextIndex !== startIndex)
  }

  getCurrentId(): T | null {
    return this.currentId
  }

  private bindFocusListener(element: blessed.Widgets.BoxElement, id: T): void {
    element.on("focus", () => {
      const index = this.focusTargets.findIndex((target) => target.id === id)
      if (index !== -1) {
        this.currentIndex = index
        this.currentId = id
      }
    })
  }

  private isFocusable(target: FocusTarget<T>): boolean {
    return target.enabled && !target.element.hidden
  }
}
