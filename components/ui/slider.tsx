// components/ui/slider.tsx
'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface SliderProps {
  value: number[]
  onValueChange: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  className?: string
  disabled?: boolean
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ value, onValueChange, min = 0, max = 100, step = 1, className, disabled }, ref) => {
    const trackRef = React.useRef<HTMLDivElement>(null)
    const currentValue = value[0] ?? min
    const percentage = ((currentValue - min) / (max - min)) * 100

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || !trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      const rawValue = min + ratio * (max - min)
      const steppedValue = Math.round(rawValue / step) * step
      const clampedValue = Math.min(max, Math.max(min, steppedValue))
      onValueChange([clampedValue])
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      let next = currentValue
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(max, currentValue + step)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(min, currentValue - step)
      if (next !== currentValue) {
        e.preventDefault()
        onValueChange([next])
      }
    }

    return (
      <div
        ref={ref}
        className={cn('relative flex w-full touch-none select-none items-center', className)}
      >
        <div
          ref={trackRef}
          className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted cursor-pointer"
          onClick={handleClick}
        >
          <div
            className="absolute h-full bg-role-primary rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={currentValue}
          className={cn(
            'absolute block h-5 w-5 rounded-full border-2 border-role-primary bg-white shadow transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-role-primary focus-visible:ring-offset-2',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'
          )}
          style={{ left: `calc(${percentage}% - 10px)` }}
          onKeyDown={handleKeyDown}
        />
      </div>
    )
  }
)
Slider.displayName = 'Slider'

export { Slider }