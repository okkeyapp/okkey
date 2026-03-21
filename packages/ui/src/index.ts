export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
}

export function Button(props: ButtonProps): string {
  return `${props.variant ?? "primary"}:${props.label}`;
}

export interface InputProps {
  value: string;
  placeholder?: string;
}

export function Input(props: InputProps): string {
  return props.placeholder ? `${props.placeholder}:${props.value}` : props.value;
}
