import { useCallback, useRef, useState } from "react"

export type SwipeDir = "left" | "right" | "down"

interface Drag {
  x: number
  y: number
  active: boolean
}

const THRESHOLD = 90

/**
 * Pointer-based card dragging. Deliberately dependency-free: pointer events
 * cover mouse, touch and pen, so there's nothing a gesture library would add.
 */
export function useSwipe(onCommit: (dir: SwipeDir) => void) {
  const [drag, setDrag] = useState<Drag>({ x: 0, y: 0, active: false })
  const [flying, setFlying] = useState<SwipeDir | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)

  const fly = useCallback(
    (dir: SwipeDir) => {
      setFlying(dir)
      setDrag({ x: 0, y: 0, active: false })
      // let the card animate off before the stack advances
      window.setTimeout(() => {
        setFlying(null)
        onCommit(dir)
      }, 180)
    },
    [onCommit]
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (flying) return
    origin.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x: 0, y: 0, active: true })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!origin.current) return
    setDrag({
      x: e.clientX - origin.current.x,
      y: e.clientY - origin.current.y,
      active: true,
    })
  }

  const onPointerUp = () => {
    if (!origin.current) return
    const { x, y } = drag
    origin.current = null
    if (Math.abs(x) > THRESHOLD && Math.abs(x) > Math.abs(y)) fly(x > 0 ? "right" : "left")
    else if (y > THRESHOLD) fly("down")
    else setDrag({ x: 0, y: 0, active: false })
  }

  // how committed the gesture looks, for tinting the card 0..1
  const intent: { dir: SwipeDir | null; strength: number } = (() => {
    if (flying) return { dir: flying, strength: 1 }
    const { x, y } = drag
    if (Math.abs(x) > Math.abs(y) && Math.abs(x) > 12)
      return { dir: x > 0 ? "right" : "left", strength: Math.min(1, Math.abs(x) / THRESHOLD) }
    if (y > 12) return { dir: "down", strength: Math.min(1, y / THRESHOLD) }
    return { dir: null, strength: 0 }
  })()

  const style: React.CSSProperties = flying
    ? {
        transform:
          flying === "down"
            ? "translateY(120%) scale(0.9)"
            : `translateX(${flying === "right" ? 140 : -140}%) rotate(${flying === "right" ? 18 : -18}deg)`,
        opacity: 0,
        transition: "transform 0.18s ease-out, opacity 0.18s ease-out",
      }
    : {
        transform: `translate(${drag.x}px, ${Math.max(drag.y, -40)}px) rotate(${drag.x / 22}deg)`,
        transition: drag.active ? "none" : "transform 0.2s cubic-bezier(.2,.8,.3,1)",
      }

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    style,
    intent,
    fly,
    busy: flying !== null,
  }
}
