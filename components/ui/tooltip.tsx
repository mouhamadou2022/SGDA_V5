'use client';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import React from 'react';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={className}
    {...props}
  />
));
TooltipContent.displayName = 'TooltipContent';

export function SimpleTooltip({ content, children, className = '' }: {
  content: string; children: React.ReactNode; className?: string;
}) {
  if (!content) return <>{children}</>;
  return (
    <span className={`tooltip ${className}`}>
      {children}
      <span className="tooltip-text">{content}</span>
    </span>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
