import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

const switchRootVariants = cva(
  "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
  {
    variants: {
      size: {
        /** Track 36×20px (shadcn default). */
        default: "h-5 w-9",
        /** Track 44×24px — matches touch-friendly control height. */
        lg: "h-6 w-11 min-h-6 min-w-11",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const switchThumbVariants = cva(
  "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=unchecked]:translate-x-0",
  {
    variants: {
      size: {
        default: "h-4 w-4 data-[state=checked]:translate-x-4",
        lg: "h-5 w-5 data-[state=checked]:translate-x-5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> &
  VariantProps<typeof switchRootVariants>;

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, SwitchProps>(
  ({ className, size, onPointerDown, onKeyDown, ...props }, ref) => {
    // The thumb and track transitions must not run on mount. A checked switch
    // otherwise slides in from the unchecked position when its tab is shown.
    const [motionReady, setMotionReady] = React.useState(false);
    React.useEffect(() => {
      const frame = requestAnimationFrame(() => {
        setMotionReady(true);
      });
      return () => cancelAnimationFrame(frame);
    }, []);

    const enableMotion = () => {
      setMotionReady(true);
    };

    return (
      <SwitchPrimitives.Root
        className={cn(switchRootVariants({ size }), !motionReady && "transition-none", className)}
        {...props}
        onPointerDown={(event) => {
          enableMotion();
          onPointerDown?.(event);
        }}
        onKeyDown={(event) => {
          enableMotion();
          onKeyDown?.(event);
        }}
        ref={ref}
      >
        <SwitchPrimitives.Thumb
          className={cn(switchThumbVariants({ size }), !motionReady && "transition-none")}
        />
      </SwitchPrimitives.Root>
    );
  },
);
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
