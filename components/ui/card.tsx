import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const cardVariants = cva(
  "card",
  {
    variants: {
      variant: {
        default: "",
        role: "border-l-4 border-l-role-primary",
        level: "border-l-4",
        alert: "border-l-4",
        interactive: "cursor-pointer hover:border-role-primary/30",
        glass: "backdrop-blur-sm border-border/80 bg-card/90 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_6px_16px_rgba(0,0,0,0.04)]",
      },
      levelColor: {
        danger: "border-l-danger",
        warning: "border-l-warning",
        primary: "border-l-primary",
        success: "border-l-success",
        none: "",
      },
      alertBg: {
        danger: "bg-danger-soft border-l-danger",
        warning: "bg-warning-soft border-l-warning",
        primary: "bg-primary-soft border-l-primary",
        success: "bg-success-soft border-l-success",
        none: "",
      },
      size: {
        sm: "",
        md: "",
        lg: "",
      },
    },
    defaultVariants: {
      variant: "default",
      levelColor: "none",
      alertBg: "none",
      size: "md",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  heading?: React.ReactNode
  title?: string
  subtitle?: string
  icon?: React.ReactNode
  badge?: React.ReactNode
  headerGradient?: boolean
  interactive?: boolean
  contentClassName?: string
}

const TITLE_COLORS: Record<string, string> = {
  danger: "text-danger",
  warning: "text-warning",
  primary: "text-primary",
  success: "text-success",
}

const SHADOW = "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)"

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, levelColor, alertBg, size, heading, title, subtitle, icon, badge, headerGradient, interactive, children, contentClassName, ...props }, ref) => {
    const isAlert = variant === "alert" && alertBg && alertBg !== "none"
    const isGlass = variant === "glass"
    const hasHeader = Boolean(heading || title || icon || badge)
    const resolvedVariant = interactive && (variant === "default" || variant === "role") ? "interactive" : variant
    const showGradient = headerGradient ?? (hasHeader && !isAlert)
    const titleColor = (resolvedVariant === "level" && levelColor && levelColor !== "none") ? TITLE_COLORS[levelColor] : ""

    const isSm = size === "sm"
    const isLg = size === "lg"
    const bodyV = isSm ? "py-5" : isLg ? "py-8" : "py-7"
    const bodyH = isSm ? "px-5" : isLg ? "px-8" : "px-7"
    const hdrV = isSm ? "py-3" : isLg ? "py-5" : "py-5"
    const hdrH = isSm ? "px-5" : isLg ? "px-8" : "px-7"

    return (
      <div
        ref={ref}
        style={{ boxShadow: isAlert || isGlass ? undefined : SHADOW }}
        className={cn(
          isGlass
            ? "rounded-2xl overflow-hidden font-sans border backdrop-blur-sm"
            : "bg-card border border-border rounded-[12px] overflow-hidden font-sans",
          isAlert ? "" : isGlass ? "" : "hover:shadow-[0_1px_4px_rgba(0,0,0,0.08),0_6px_16px_rgba(0,0,0,0.06)]",
          cardVariants({ variant: resolvedVariant, levelColor, alertBg, size }),
          className
        )}
        {...props}
      >
        {hasHeader && (
          <div
            className={cn(
              "border-b border-border",
              "flex items-center gap-3",
              hdrH, hdrV,
              !showGradient && !isAlert && !isGlass && "bg-muted/[0.03]"
            )}
            style={showGradient && !isGlass ? { background: 'linear-gradient(90deg, rgba(var(--role-primary-rgb), 0.15) 0%, transparent 100%)' } : undefined}
          >
            {heading ? (
              <>
                {icon && <span className={cn("shrink-0", titleColor || "text-role-primary")}>{icon}</span>}
                <div className="flex-1 flex items-center gap-2">
                  <span className={cn("font-semibold leading-tight tracking-tight", titleColor || "text-foreground")} style={{ fontSize: "15px" }}>{heading}</span>
                </div>
                {badge && <span className="shrink-0 ml-auto">{badge}</span>}
              </>
            ) : (
              <>
                {icon && <span className={cn("shrink-0", titleColor || "text-role-primary", "[&>svg]:w-[18px] [&>svg]:h-[18px]")}>{icon}</span>}
                <div className="flex-1 min-w-0">
                  {title && <div className={cn("font-semibold leading-tight tracking-tight truncate", titleColor || "text-foreground")} style={{ fontSize: "15px" }}>{title}</div>}
                  {subtitle && <div className={cn("text-[13px] mt-1 leading-snug", "text-foreground/50")}>{subtitle}</div>}
                </div>
                {badge && <span className="shrink-0 ml-auto">{badge}</span>}
              </>
            )}
          </div>
        )}
        <div className={cn(bodyH, bodyV, "text-sm leading-relaxed", contentClassName, isAlert ? "text-foreground" : "text-foreground/80")}>{children}</div>
      </div>
    )
  }
)
Card.displayName = "Card"

export { Card, cardVariants }
