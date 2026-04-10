import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

/**
 * Pixel-perfect sizes: viewBox 24×24, stroke 2 user units →
 * sm 24px → 2px stroke, default 36px → 3px stroke, lg 48px → 4px stroke.
 */
const spinnerVariants = cva("block shrink-0 animate-spin overflow-visible", {
  variants: {
    size: {
      small: "h-[24px] w-[24px]",
      default: "h-[36px] w-[36px]",
      large: "h-[48px] w-[48px]",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export type SpinnerProps = Omit<React.SVGProps<SVGSVGElement>, "children"> &
  VariantProps<typeof spinnerVariants>;

const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(({ className, size, ...props }, ref) => {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    >
      <circle
        className="stroke-muted-foreground/20"
        cx="12"
        cy="12"
        r="9"
        fill="none"
        strokeWidth="2"
      />
      <path
        className="stroke-accent"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        d="M12 3A9 9 0 0 1 21 12"
      />
    </svg>
  );
});
Spinner.displayName = "Spinner";

export { Spinner, spinnerVariants };
