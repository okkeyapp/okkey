import type { SVGProps } from "react";
import { OkkeyLogoMark as SharedOkkeyLogoMark } from "@okkey/ui";

/** @deprecated Prefer `OkkeyLogoMark` from `@okkey/ui`. Kept as default export for existing web imports. */
export default function OkkeyLogoMark(props: SVGProps<SVGSVGElement>) {
  return <SharedOkkeyLogoMark {...props} />;
}
