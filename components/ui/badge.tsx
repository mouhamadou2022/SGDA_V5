// components/ui/badge.tsx — CSS design system aligned
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Each variant maps to a modifier class applied alongside "badge"
const badgeVariants = cva(
  "badge",
  {
    variants: {
      variant: {
        default:        "primary",
        secondary:      "neutral",
        destructive:    "danger",
        outline:        "outline",
        success:        "success",
        primary:        "primary",
        warning:        "warning",
        danger:         "danger",
        neutral:        "neutral",
        teal:           "teal",
        info:           "primary",
        "navy-filled":  "primary",
        "amber-filled": "warning",
        "green-filled": "success",
        pulse:          "danger pulse",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
