/** Semi-implicit Euler spring. dt is clamped by the caller. */
export type SpringConfig = { stiffness: number; damping: number }

export const LAYOUT_SPRING: SpringConfig = { stiffness: 170, damping: 26 } // ~300ms, a hair of overshoot
export const PUSH_SPRING: SpringConfig = { stiffness: 220, damping: 18 } // underdamped: a small settle, not a dead stop
export const SCALE_SPRING: SpringConfig = { stiffness: 260, damping: 22 } // birth overshoot

export type Axis = { value: number; velocity: number }

export function step(axis: Axis, target: number, cfg: SpringConfig, dt: number): boolean {
  const force = -cfg.stiffness * (axis.value - target) - cfg.damping * axis.velocity
  axis.velocity += force * dt
  axis.value += axis.velocity * dt
  if (Math.abs(axis.value - target) < 0.01 && Math.abs(axis.velocity) < 0.05) {
    axis.value = target
    axis.velocity = 0
    return true // at rest
  }
  return false
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
