import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[color,background-color,box-shadow,border-color] focus:outline-none focus:shadow-[0_0_0_2px_hsl(var(--accent)/0.4)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)/0.4)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      size: {
        default: "h-9 px-4 py-2 rounded-md",
        sm: "h-8 rounded-sm px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10 rounded-md",
      },
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary active:text-primary-foreground",
        destructive:
          "border border-input bg-background text-destructive shadow-[0_1px_2px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.1)] hover:bg-destructive hover:text-destructive-foreground hover:shadow-none focus:border-destructive focus-visible:border-destructive focus:shadow-[0_0_0_2px_hsl(var(--destructive)/0.4)] focus-visible:shadow-[0_0_0_2px_hsl(var(--destructive)/0.4)] active:bg-destructive/90 active:text-destructive-foreground",
        outline:
          "border border-input bg-background shadow-[0_1px_2px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.1)] hover:bg-accent hover:text-accent-foreground hover:shadow-none focus:border-accent focus-visible:border-accent active:bg-accent/90 active:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary active:text-secondary-foreground",
        ghost:
          "hover:bg-accent/90 hover:text-accent-foreground active:bg-accent active:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/75",
      },
    },
    compoundVariants: [
      { size: "sm", variant: "ghost", className: "h-8 px-2 rounded-sm" },
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
