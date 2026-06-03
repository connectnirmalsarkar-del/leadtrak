import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

const PopoverContent = React.forwardRef(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
  const safePadding = React.useMemo(() => {
    if (typeof window === 'undefined') return { top: 8, bottom: 8, left: 8, right: 8 };
    const cs = getComputedStyle(document.documentElement);
    const read = (n) => { const v = parseInt(cs.getPropertyValue(n).trim(), 10); return Number.isFinite(v) ? v : 0; };
    return { top: read('--safe-area-top') + 8, bottom: read('--safe-area-bottom') + 8, left: 8, right: 8 };
  }, []);
  return (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={safePadding}
      style={{
        maxHeight: 'min(var(--radix-popover-content-available-height), calc(100dvh - var(--safe-area-top, 0px) - var(--safe-area-bottom, 0px) - 24px))',
        overflowY: 'auto',
      }}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]",
        className
      )}
      {...props} />
  </PopoverPrimitive.Portal>
  );
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
