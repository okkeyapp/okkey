import React from "react";

export function Button({
  children,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} {...props}>
      {children}
    </button>
  );
}

export const Input = React.forwardRef(function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>,
  ref: React.Ref<HTMLInputElement>,
) {
  return <input ref={ref} {...props} />;
});

export function Spinner() {
  return <span data-testid="spinner" />;
}
