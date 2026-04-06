import type { SVGProps } from "react";

import { WorkspaceTile } from "@okkey/ui";

const YANDEX_FAVICON_URL = "https://favicon.yandex.net/favicon/yandex.ru?size=120";

/** Default personal tile fill; replace with user settings when available. */
const PERSONAL_WORKSPACE_TILE_COLOR = "#3B82F6";

/** Dashed “create” tile: dark outline, no filled shadow on the tile. */
const dashedTileChrome =
  "border border-dashed border-foreground/90 bg-transparent shadow-none dark:border-foreground/70";

/** Shield + plus — stroke follows `currentColor`. */
function CreateWorkspaceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={48}
      height={48}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <path
        d="M18 24H30M24 18V30M40 25.9999C40 35.9999 33 40.9999 24.68 43.8999C24.2443 44.0476 23.7711 44.0405 23.34 43.8799C15 40.9999 8 35.9999 8 25.9999V11.9999C8 11.4695 8.21071 10.9608 8.58579 10.5857C8.96086 10.2106 9.46957 9.99992 10 9.99992C14 9.99992 19 7.59992 22.48 4.55992C22.9037 4.19792 23.4427 3.99902 24 3.99902C24.5573 3.99902 25.0963 4.19792 25.52 4.55992C29.02 7.61992 34 9.99992 38 9.99992C38.5304 9.99992 39.0391 10.2106 39.4142 10.5857C39.7893 10.9608 40 11.4695 40 11.9999V25.9999Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function WorkspacesContent() {
  return (
    <div className="flex w-full flex-nowrap items-start justify-center gap-4 overflow-x-auto px-1 py-3">
      <WorkspaceTile
        type="button"
        title="Personal"
        description="Free"
        tileColor={PERSONAL_WORKSPACE_TILE_COLOR}
      />

      <WorkspaceTile
        type="button"
        title="Yandex team"
        description="Enterprise"
        imageSrc={YANDEX_FAVICON_URL}
        imageAlt=""
        business
      />

      <button
        type="button"
        aria-label="Create workspace"
        className={`flex h-[170px] w-[180px] shrink-0 flex-col items-center justify-center gap-3 rounded-xl p-6 ${dashedTileChrome} transition-[transform,box-shadow] hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
      >
        <p className="okkey-body-strong text-center text-copy-primary">
          Create
          <br />
          workspace
        </p>
        <CreateWorkspaceMark className="shrink-0 text-copy-primary" />
      </button>
    </div>
  );
}
