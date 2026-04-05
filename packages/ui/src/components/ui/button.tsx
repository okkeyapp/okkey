import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[color,background-color,box-shadow,border-color] focus:outline-none focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      size: {
        default: "h-9 px-4 py-2 rounded-md",
        sm: "h-8 rounded-sm px-3",
        lg: "h-11 rounded-md px-8",
        /** Square icon trigger, 36×36 — use with `variant` (primary / outline / …). */
        icon: "!p-0 shrink-0 h-9 w-9 min-h-9 min-w-9 rounded-md",
        /** 32×32 */
        iconSm: "!p-0 shrink-0 h-8 w-8 min-h-8 min-w-8 rounded-sm",
        /** 44×44 */
        iconLg: "!p-0 shrink-0 h-11 w-11 min-h-11 min-w-11 rounded-md",
      },
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary active:text-primary-foreground",
        destructive:
          "border border-input bg-background text-destructive shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.05)] hover:bg-destructive hover:text-destructive-foreground hover:shadow-none focus:border-destructive focus-visible:border-destructive focus:hover:border-destructive focus-visible:hover:border-destructive dark:focus:hover:border-destructive dark:focus-visible:hover:border-destructive focus:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] focus-visible:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] dark:focus:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] dark:focus-visible:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] focus:hover:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] focus-visible:hover:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] dark:focus:hover:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] dark:focus-visible:hover:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] active:bg-destructive/90 active:text-destructive-foreground",
        outline:
          "border border-input bg-transparent text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.05)] hover:bg-muted hover:shadow-none focus:border-accent focus-visible:border-accent focus:hover:border-accent focus-visible:hover:border-accent dark:focus:hover:border-accent dark:focus-visible:hover:border-accent focus:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] focus-visible:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-visible:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
          "data-[state=open]:outline-none data-[state=open]:border-accent data-[state=open]:bg-muted data-[state=open]:text-foreground " +
          "data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
          "data-[state=open]:hover:border-accent dark:data-[state=open]:hover:border-accent " +
          "data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
          "active:bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)] dark:active:bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)] dark:hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)] active:bg-secondary active:text-secondary-foreground",
        ghost:
          "hover:bg-muted active:bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)] dark:active:bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)]",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/75",
      },
    },
    compoundVariants: [
      { size: "sm", variant: "ghost", className: "h-8 px-3 rounded-sm" },
      { size: "sm", variant: "link", className: "h-8 px-2 rounded-sm" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
