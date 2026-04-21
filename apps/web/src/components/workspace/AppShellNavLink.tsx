import { type ComponentProps, forwardRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Narrow `react-router` `Link` for `@okkey/ui` shell nav (`to` is a path string).
 * Must `forwardRef` so Radix `DropdownMenuItem` / `Slot` `asChild` can attach refs and hover (`data-[highlighted]`).
 */
type AppShellNavLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: ComponentProps<"a">["aria-current"];
};

const AppShellNavLink = forwardRef<HTMLAnchorElement, AppShellNavLinkProps>(function AppShellNavLink(
  { to, className, children, "aria-current": ariaCurrent },
  ref,
) {
  return (
    <Link ref={ref} to={to} className={className} aria-current={ariaCurrent}>
      {children}
    </Link>
  );
});

export default AppShellNavLink;
