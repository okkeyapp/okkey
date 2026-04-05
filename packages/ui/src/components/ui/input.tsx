import * as React from "react";

import { inputLikeControlClassName } from "../../lib/input-like-control-classes.js";
import { cn } from "../../lib/utils.js";

export type InputProps = React.ComponentProps<"input">;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(inputLikeControlClassName, className)}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
