import { cn } from "@okkey/ui";
import type { ReactNode } from "react";

type VaultListRowProps = {
  icon: string;
  title: string;
  description: string;
  trailing: ReactNode;
  onClick?: () => void;
  className?: string;
  rounded?: "top" | "bottom" | "both" | "none";
};

export default function VaultListRow({
  icon,
  title,
  description,
  trailing,
  onClick,
  className,
  rounded = "both",
}: VaultListRowProps) {
  const roundedClass =
    rounded === "both"
      ? "rounded-lg"
      : rounded === "top"
        ? "rounded-t-lg"
        : rounded === "bottom"
          ? "rounded-b-lg"
          : "";

  const hasDescription = description.trim().length > 0;

  const content = (
    <>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-base leading-none">
        <span aria-hidden>{icon}</span>
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col text-left",
          hasDescription ? "gap-1 justify-center" : "justify-center",
        )}
      >
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {hasDescription ? (
          <p className="truncate text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">{trailing}</div>
    </>
  );

  const rowClassName = cn(
    "relative flex w-full items-center gap-4 border border-border px-4 py-4 text-left outline-none",
    "transition-[color,box-shadow,background-color,border-color]",
    roundedClass,
    onClick && "cursor-pointer hover:bg-secondary",
    className,
  );

  if (onClick) {
    return (
      <button type="button" className={rowClassName} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}
