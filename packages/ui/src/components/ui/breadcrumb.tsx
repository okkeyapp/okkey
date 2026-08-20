import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "../../lib/utils.js";
import { buttonVariants } from "./button.js";

const breadcrumbLinkClassName = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "h-6 min-h-6 max-h-6 min-w-0 max-w-full gap-1.5 px-1 text-sm font-normal text-copy-secondary hover:text-foreground",
);

const breadcrumbPageClassName =
  "inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 truncate px-1 text-sm text-foreground";

function BreadcrumbBar({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "hidden h-[52px] shrink-0 items-center overflow-visible border-b border-border md:flex",
        className,
      )}
      {...props}
    />
  );
}

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      className={cn("flex min-w-0 flex-1 items-center overflow-visible ps-5 pe-5", className)}
      {...props}
    />
  );
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      className={cn("flex min-w-0 flex-nowrap items-center gap-1.5", className)}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li className={cn("min-w-0 shrink", className)} {...props} />;
}

function BreadcrumbLink({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "a";
  return <Comp className={cn(breadcrumbLinkClassName, className)} {...props} />;
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn(breadcrumbPageClassName, className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      role="presentation"
      aria-hidden
      className={cn("flex shrink-0 items-center text-muted-foreground", className)}
      {...props}
    >
      {children ?? <BreadcrumbChevronIcon />}
    </li>
  );
}

function BreadcrumbChevronIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <path
        d="M5.25 10.5L8.75 7L5.25 3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export {
  Breadcrumb,
  BreadcrumbBar,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  breadcrumbLinkClassName,
  breadcrumbPageClassName,
};
