import * as React from "react";

import { Button } from "./button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";
import { ScrollArea } from "./scroll-area.js";
import { PersonalWorkspaceMark } from "./workspace-tile.js";
import {
  OkkeySidebarFoldersMenu,
  OkkeySidebarPlainLinksMenu,
  OkkeySidebarVaultsMenu,
  OkkeySidebarWorkspaceMenu,
  type OkkeySidebarFolderTreeNode,
  type OkkeySidebarPlainLinkItem,
  type OkkeySidebarVaultItem,
  type OkkeySidebarWorkspaceNavItem,
  type OkkeyWorkspaceNavLinkComponent,
} from "./okkey-sidebar-menus.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "./sidebar.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.js";
import { cn } from "../../lib/utils.js";

/** Viewport width strictly below 991px — mobile workspace shell (drawer nav). */
const OKKEY_APP_SHELL_MOBILE_MQ = "(max-width: 990px)";

function subscribeOkkeyAppShellMobile(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const mq = window.matchMedia(OKKEY_APP_SHELL_MOBILE_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getOkkeyAppShellMobileSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia(OKKEY_APP_SHELL_MOBILE_MQ).matches;
}

function useOkkeyAppShellIsMobile() {
  return React.useSyncExternalStore(subscribeOkkeyAppShellMobile, getOkkeyAppShellMobileSnapshot, () => false);
}

export type OkkeyAppShellLayoutContextValue = {
  isMobile: boolean;
  mobileDrawerOpen: boolean;
  setMobileDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const OkkeyAppShellLayoutContext = React.createContext<OkkeyAppShellLayoutContextValue | null>(null);

/**
 * Mobile drawer / narrow viewport state for {@link OkkeyAppSidebar}.
 * Safe to call outside the provider (e.g. storybook): returns non-mobile inert defaults.
 */
export function useOkkeyAppShellLayout(): OkkeyAppShellLayoutContextValue {
  const ctx = React.useContext(OkkeyAppShellLayoutContext);
  if (!ctx) {
    return {
      isMobile: false,
      mobileDrawerOpen: false,
      setMobileDrawerOpen: () => {},
    };
  }
  return ctx;
}

function MenuBurgerIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path d="M2.66663 4H13.3333M2.66663 8H13.3333M2.66663 12H13.3333" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function CloseNavIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function ChevronsUpDownIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M4.66663 10.0001L7.99996 13.3334L11.3333 10.0001M4.66663 6.00008L7.99996 2.66675L11.3333 6.00008"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M3.33337 8.00004H12.6667M8.00004 3.33337V12.6667"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Figma 16×16 — theme via `currentColor` */
function NavRecordsIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M2.50001 3.83334C2.50001 3.47972 2.64048 3.14058 2.89053 2.89054C3.14058 2.64049 3.47972 2.50001 3.83334 2.50001L12.1667 2.49999C12.5203 2.49999 12.8594 2.64047 13.1095 2.89052C13.3595 3.14056 13.5 3.4797 13.5 3.83333V5.16666C13.5 5.52028 13.3595 5.85942 13.1095 6.10947C12.8594 6.35952 12.5203 6.49999 12.1667 6.49999L3.83334 6.50001C3.47972 6.50001 3.14058 6.35954 2.89053 6.10949C2.64048 5.85944 2.50001 5.5203 2.50001 5.16668V3.83334Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.37801 10.8333C2.37801 10.4797 2.51848 10.1406 2.76853 9.89052C3.01858 9.64048 3.35772 9.5 3.71134 9.5L12.1667 9.5C12.5203 9.5 12.8594 9.64048 13.1095 9.89052C13.3595 10.1406 13.5 10.4797 13.5 10.8333V12.1667C13.5 12.5203 13.3595 12.8594 13.1095 13.1095C12.8594 13.3595 12.5203 13.5 12.1667 13.5H3.71134C3.35772 13.5 3.01858 13.3595 2.76853 13.1095C2.51848 12.8594 2.37801 12.5203 2.37801 12.1667V10.8333Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavCapsulesIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M6.40001 3.2C7.2487 2.35131 8.39977 1.87452 9.60001 1.87452C10.8002 1.87452 11.9513 2.35131 12.8 3.2C13.6487 4.04869 14.1255 5.19977 14.1255 6.4C14.1255 7.60023 13.6487 8.75131 12.8 9.6L9.60001 12.8C8.75131 13.6487 7.60024 14.1255 6.4 14.1255C5.19977 14.1255 4.0487 13.6487 3.2 12.8C2.35131 11.9513 1.87452 10.8002 1.87452 9.6C1.87452 8.39977 2.35131 7.24869 3.2 6.4L6.40001 3.2Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="5.03648" y1="4.56353" x2="11.5926" y2="11.1196" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function NavMonitoringIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M13.526 10.336C13.1443 11.2389 12.5473 12.0345 11.7871 12.6533C11.027 13.2721 10.1269 13.6952 9.16553 13.8856C8.20415 14.0761 7.21077 14.0281 6.27223 13.7458C5.33368 13.4635 4.47856 12.9556 3.78161 12.2664C3.08466 11.5772 2.56712 10.7277 2.27422 9.79221C1.98132 8.85671 1.92198 7.86369 2.1014 6.89995C2.28082 5.93622 2.69352 5.03112 3.30344 4.26378C3.91335 3.49645 4.70191 2.89024 5.60015 2.49816M14 8.00138C14 7.21327 13.8448 6.43287 13.5433 5.70475C13.2418 4.97663 12.7998 4.31504 12.2427 3.75776C11.6855 3.20048 11.0241 2.75843 10.2962 2.45683C9.56826 2.15523 8.78806 2 8.00015 2V8.00138H14Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavToolsIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M9.8 4.2C9.67785 4.32462 9.60943 4.49216 9.60943 4.66666C9.60943 4.84117 9.67785 5.00871 9.8 5.13333L10.8667 6.2C10.9913 6.32215 11.1588 6.39057 11.3333 6.39057C11.5078 6.39057 11.6754 6.32215 11.8 6.2L14.3133 3.68666C14.6486 4.42746 14.7501 5.25282 14.6043 6.05276C14.4586 6.8527 14.0725 7.58923 13.4975 8.16418C12.9226 8.73914 12.186 9.12522 11.3861 9.27097C10.5862 9.41672 9.7608 9.31522 9.02 8.98L4.41334 13.5867C4.14812 13.8519 3.78841 14.0009 3.41334 14.0009C3.03826 14.0009 2.67855 13.8519 2.41334 13.5867C2.14812 13.3214 1.99912 12.9617 1.99912 12.5867C1.99912 12.2116 2.14812 11.8519 2.41334 11.5867L7.02 6.98C6.68478 6.2392 6.58328 5.41384 6.72903 4.6139C6.87478 3.81396 7.26086 3.07743 7.83582 2.50248C8.41077 1.92752 9.1473 1.54144 9.94724 1.39569C10.7472 1.24994 11.5725 1.35144 12.3133 1.68666L9.80667 4.19333L9.8 4.2Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavSettingsIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M8.14667 1.33333H7.85333C7.49971 1.33333 7.16057 1.4738 6.91053 1.72385C6.66048 1.9739 6.52 2.31304 6.52 2.66666V2.78666C6.51976 3.02048 6.45804 3.25012 6.34103 3.45255C6.22401 3.65498 6.05583 3.82309 5.85333 3.93999L5.56667 4.10666C5.36398 4.22369 5.13405 4.28529 4.9 4.28529C4.66595 4.28529 4.43603 4.22369 4.23333 4.10666L4.13333 4.05333C3.82738 3.87684 3.46389 3.82896 3.12267 3.9202C2.78145 4.01144 2.49037 4.23435 2.31333 4.53999L2.16667 4.79333C1.99018 5.09928 1.9423 5.46277 2.03354 5.80399C2.12478 6.14522 2.34769 6.43629 2.65333 6.61333L2.75333 6.67999C2.95485 6.79634 3.12241 6.96339 3.23937 7.16455C3.35632 7.36571 3.4186 7.59398 3.42 7.82666V8.16666C3.42093 8.40161 3.35977 8.63263 3.2427 8.83633C3.12563 9.04004 2.95681 9.20919 2.75333 9.32666L2.65333 9.38666C2.34769 9.5637 2.12478 9.85477 2.03354 10.196C1.9423 10.5372 1.99018 10.9007 2.16667 11.2067L2.31333 11.46C2.49037 11.7656 2.78145 11.9885 3.12267 12.0798C3.46389 12.171 3.82738 12.1232 4.13333 11.9467L4.23333 11.8933C4.43603 11.7763 4.66595 11.7147 4.9 11.7147C5.13405 11.7147 5.36398 11.7763 5.56667 11.8933L5.85333 12.06C6.05583 12.1769 6.22401 12.345 6.34103 12.5474C6.45804 12.7499 6.51976 12.9795 6.52 13.2133V13.3333C6.52 13.6869 6.66048 14.0261 6.91053 14.2761C7.16057 14.5262 7.49971 14.6667 7.85333 14.6667H8.14667C8.50029 14.6667 8.83943 14.5262 9.08948 14.2761C9.33953 14.0261 9.48 13.6869 9.48 13.3333V13.2133C9.48024 12.9795 9.54196 12.7499 9.65898 12.5474C9.77599 12.345 9.94418 12.1769 10.1467 12.06L10.4333 11.8933C10.636 11.7763 10.866 11.7147 11.1 11.7147C11.3341 11.7147 11.564 11.7763 11.7667 11.8933L11.8667 11.9467C12.1726 12.1232 12.5361 12.171 12.8773 12.0798C13.2186 11.9885 13.5096 11.7656 13.6867 11.46L13.8333 11.2C14.0098 10.894 14.0577 10.5306 13.9665 10.1893C13.8752 9.84811 13.6523 9.55703 13.3467 9.37999L13.2467 9.32666C13.0432 9.20919 12.8744 9.04004 12.7573 8.83633C12.6402 8.63263 12.5791 8.40161 12.58 8.16666V7.83333C12.5791 7.59838 12.6402 7.36736 12.7573 7.16366C12.8744 6.95995 13.0432 6.7908 13.2467 6.67333L13.3467 6.61333C13.6523 6.43629 13.8752 6.14522 13.9665 5.80399C14.0577 5.46277 14.0098 5.09928 13.8333 4.79333L13.6867 4.53999C13.5096 4.23435 13.2186 4.01144 12.8773 3.9202C12.5361 3.82896 12.1726 3.87684 11.8667 4.05333L11.7667 4.10666C11.564 4.22369 11.3341 4.28529 11.1 4.28529C10.866 4.28529 10.636 4.22369 10.4333 4.10666L10.1467 3.93999C9.94418 3.82309 9.77599 3.65498 9.65898 3.45255C9.54196 3.25012 9.48024 3.02048 9.48 2.78666V2.66666C9.48 2.31304 9.33953 1.9739 9.08948 1.72385C8.83943 1.4738 8.50029 1.33333 8.14667 1.33333Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 9.99999C9.10457 9.99999 10 9.10456 10 7.99999C10 6.89543 9.10457 5.99999 8 5.99999C6.89543 5.99999 6 6.89543 6 7.99999C6 9.10456 6.89543 9.99999 8 9.99999Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarPanelToggleIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M6 2V14M3.33333 2H12.6667C13.403 2 14 2.59695 14 3.33333V12.6667C14 13.403 13.403 14 12.6667 14H3.33333C2.59695 14 2 13.403 2 12.6667V3.33333C2 2.59695 2.59695 2 3.33333 2Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavDocumentationIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  const clipId = React.useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M3.28679 3.28663L6.11345 6.1133M9.88672 6.1133L12.7134 3.28663M9.88672 9.88673L12.7134 12.7134M6.11345 9.88673L3.28679 12.7134M14.6667 8.00001C14.6667 11.6819 11.6819 14.6667 8 14.6667C4.3181 14.6667 1.33334 11.6819 1.33334 8.00001C1.33334 4.31811 4.3181 1.33334 8 1.33334C11.6819 1.33334 14.6667 4.31811 14.6667 8.00001ZM10.6667 8.00001C10.6667 9.47277 9.47276 10.6667 8 10.6667C6.52724 10.6667 5.33334 9.47277 5.33334 8.00001C5.33334 6.52725 6.52724 5.33334 8 5.33334C9.47276 5.33334 10.6667 6.52725 10.6667 8.00001Z"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function NavHelpIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M6.06006 6.00004C6.2168 5.55449 6.52616 5.17878 6.93336 4.93947C7.34057 4.70015 7.81932 4.61267 8.28485 4.69252C8.75037 4.77237 9.17261 5.01439 9.47678 5.37573C9.78095 5.73707 9.94743 6.19439 9.94673 6.66671C9.94673 8.00004 7.94673 8.66671 7.94673 8.66671M8 11.3333H8.00667M5.26667 13.3334C6.53905 13.9861 8.00273 14.1629 9.39393 13.8319C10.7851 13.5009 12.0124 12.6839 12.8545 11.5281C13.6966 10.3724 14.0983 8.95383 13.9871 7.52813C13.8758 6.10243 13.2591 4.76333 12.2479 3.75215C11.2367 2.74096 9.89759 2.12419 8.4719 2.01297C7.0462 1.90174 5.62765 2.30339 4.47188 3.14552C3.31611 3.98765 2.49913 5.21489 2.16815 6.6061C1.83717 7.9973 2.01396 9.46097 2.66667 10.7334L1.33334 14.6667L5.26667 13.3334Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M10.6667 14V12.6667C10.6667 11.9594 10.3858 11.2811 9.88566 10.781C9.38556 10.281 8.70728 10 8.00004 10H4.00004C3.2928 10 2.61452 10.281 2.11442 10.781C1.61433 11.2811 1.33337 11.9594 1.33337 12.6667V14M14.6667 13.9999V12.6666C14.6663 12.0757 14.4696 11.5018 14.1076 11.0348C13.7456 10.5678 13.2388 10.2343 12.6667 10.0866M10.6667 2.08659C11.2403 2.23346 11.7487 2.56706 12.1118 3.0348C12.4749 3.50254 12.6719 4.07781 12.6719 4.66992C12.6719 5.26204 12.4749 5.83731 12.1118 6.30505C11.7487 6.77279 11.2403 7.10639 10.6667 7.25326M8.66671 4.66667C8.66671 6.13943 7.4728 7.33333 6.00004 7.33333C4.52728 7.33333 3.33337 6.13943 3.33337 4.66667C3.33337 3.19391 4.52728 2 6.00004 2C7.4728 2 8.66671 3.19391 8.66671 4.66667Z"
        stroke="currentColor"
        strokeOpacity={0.5}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderClosedIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M1.5 6.5H14.5M13.1667 13.5C13.5203 13.5 13.8594 13.3595 14.1095 13.1095C14.3595 12.8594 14.5 12.5203 14.5 12.1667V5.83333C14.5 5.47971 14.3595 5.14057 14.1095 4.89052C13.8594 4.64048 13.5203 4.5 13.1667 4.5H8.06671C7.84372 4.50219 7.62374 4.44841 7.42691 4.34359C7.23008 4.23877 7.06268 4.08625 6.94004 3.9L6.40004 3.1C6.27863 2.91565 6.11336 2.76432 5.91904 2.6596C5.72472 2.55488 5.50745 2.50004 5.28671 2.5H2.83333C2.47971 2.5 2.14057 2.64048 1.89052 2.89052C1.64048 3.14057 1.5 3.47971 1.5 3.83333V12.1667C1.5 12.5203 1.64048 12.8594 1.89052 13.1095C2.14057 13.3595 2.47971 13.5 2.83333 13.5H13.1667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavSafesIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M5.2666 5.2666L7.0666 7.0666M8.93327 7.0666L10.7333 5.2666M5.2666 10.7333L7.0666 8.93327M8.93327 8.93327L10.7333 10.7333M3.33333 2H12.6667C13.403 2 14 2.59695 14 3.33333V12.6667C14 13.403 13.403 14 12.6667 14H3.33333C2.59695 14 2 13.403 2 12.6667V3.33333C2 2.59695 2.59695 2 3.33333 2ZM5.33333 5C5.33333 5.1841 5.1841 5.33333 5 5.33333C4.81591 5.33333 4.66667 5.1841 4.66667 5C4.66667 4.81591 4.81591 4.66667 5 4.66667C5.1841 4.66667 5.33333 4.81591 5.33333 5ZM11.3333 5C11.3333 5.1841 11.1841 5.33333 11 5.33333C10.8159 5.33333 10.6667 5.1841 10.6667 5C10.6667 4.81591 10.8159 4.66667 11 4.66667C11.1841 4.66667 11.3333 4.81591 11.3333 5ZM5.33333 11C5.33333 11.1841 5.1841 11.3333 5 11.3333C4.81591 11.3333 4.66667 11.1841 4.66667 11C4.66667 10.8159 4.81591 10.6667 5 10.6667C5.1841 10.6667 5.33333 10.8159 5.33333 11ZM11.3333 11C11.3333 11.1841 11.1841 11.3333 11 11.3333C10.8159 11.3333 10.6667 11.1841 10.6667 11C10.6667 10.8159 10.8159 10.6667 11 10.6667C11.1841 10.6667 11.3333 10.8159 11.3333 11ZM9.33333 8C9.33333 8.73638 8.73638 9.33333 8 9.33333C7.26362 9.33333 6.66667 8.73638 6.66667 8C6.66667 7.26362 7.26362 6.66667 8 6.66667C8.73638 6.66667 9.33333 7.26362 9.33333 8Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const collapsedSectionDropdownContentClassName =
  "flex w-[min(100vw-2rem,280px)] min-w-56 flex-col overflow-hidden p-0";

/** Same personal mark as the first `WorkspaceTile` demo (`tileColor="#3B82F6"`). */
const SIDEBAR_WORKSPACE_TILE_COLOR = "#3B82F6";

const DEMO_YANDEX_WORKSPACE_FAVICON = "https://favicon.yandex.net/favicon/yandex.ru?size=120";

const DEMO_PROFILE = {
  firstName: "Alexander",
  lastName: "Zorin",
  email: "alexzorin@okkey.app",
} as const;

function firstLetter(value: string): string {
  const t = value.trim();
  if (t.length === 0) return "";
  const ch = [...t][0];
  return ch ?? "";
}

function buildUserInitials(firstName: string, lastName: string, email: string): string {
  const f = firstLetter(firstName);
  const l = firstLetter(lastName);
  if (f && l) {
    return `${f.toLocaleUpperCase()}${l.toLocaleUpperCase()}`;
  }
  const combined = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const parts = combined.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = firstLetter(parts[0]);
    const b = firstLetter(parts[parts.length - 1]);
    return `${a.toLocaleUpperCase()}${b.toLocaleUpperCase()}`;
  }
  if (parts.length === 1) {
    const w = parts[0];
    const chars = [...w];
    if (chars.length >= 2) {
      return `${chars[0].toLocaleUpperCase()}${chars[1].toLocaleUpperCase()}`;
    }
    if (chars.length === 1) {
      return `${chars[0].toLocaleUpperCase()}${chars[0].toLocaleUpperCase()}`;
    }
  }
  const local = email.split("@")[0] ?? "";
  if (local.length >= 2) {
    return local.slice(0, 2).toUpperCase();
  }
  return "??";
}

function CheckMenuIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0 text-primary", className)}
      {...props}
    >
      <path
        d="M13.3333 4L6 11.3333L2.66667 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** viewBox is 24×24 but icon is 16×16 CSS px — stroke in user units is scaled by 16/24 (~0.67px per 1 unit). */
const LOGOUT_ICON_STROKE_USER = 24 / 16;

function LogOutMenuIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        stroke="currentColor"
        strokeWidth={LOGOUT_ICON_STROKE_USER}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="16 17 21 12 16 7"
        stroke="currentColor"
        strokeWidth={LOGOUT_ICON_STROKE_USER}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="21" x2="9" y1="12" y2="12" stroke="currentColor" strokeWidth={LOGOUT_ICON_STROKE_USER} strokeLinecap="round" />
    </svg>
  );
}

/** Row highlight for the current workspace in switcher menus (shared with app shell). */
export const workspaceSwitcherActiveItemClassName =
  "bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)] data-[highlighted]:bg-secondary dark:data-[highlighted]:bg-secondary";

function WorkspaceSwitcherDropdownPanel() {
  return (
    <>
      <div className="p-1">
        <DropdownMenuItem
          aria-current="true"
          className={cn("h-auto cursor-pointer items-center gap-3", workspaceSwitcherActiveItemClassName)}
        >
          <div className="size-8 shrink-0 overflow-hidden rounded-lg">
            <PersonalWorkspaceMark fillColor={SIDEBAR_WORKSPACE_TILE_COLOR} className="block size-full" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold leading-5 text-foreground">Okkey team</p>
            <p className="truncate text-xs leading-4 text-muted-foreground">Enterprise</p>
          </div>
          <CheckMenuIcon className="shrink-0" />
        </DropdownMenuItem>
        <DropdownMenuItem className="h-auto cursor-pointer items-center gap-3">
          <img
            src={DEMO_YANDEX_WORKSPACE_FAVICON}
            alt=""
            width={32}
            height={32}
            decoding="async"
            loading="lazy"
            className="size-8 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold leading-5 text-foreground">Yandex team</p>
            <p className="truncate text-xs leading-4 text-muted-foreground">Enterprise</p>
          </div>
        </DropdownMenuItem>
      </div>
      <div className="border-t border-border" role="presentation" />
      <div className="p-1">
        <DropdownMenuItem className="cursor-pointer justify-center gap-2">
          <PlusIcon />
          <span>New workspace</span>
        </DropdownMenuItem>
      </div>
    </>
  );
}

function ProfileAccountDropdownPanel({
  firstName,
  lastName,
  email,
  onLogout,
}: {
  firstName: string;
  lastName: string;
  email: string;
  onLogout?: () => void;
}) {
  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const titleLine = displayName.length > 0 ? displayName : email;
  const initials = buildUserInitials(firstName, lastName, email);

  return (
    <>
      <div className="flex gap-3 border-b border-border px-3 py-3">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold uppercase leading-none text-primary-foreground"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold leading-5 text-foreground">{titleLine}</p>
          {displayName ? <p className="truncate text-xs leading-4 text-muted-foreground">{email}</p> : null}
        </div>
      </div>
      <div className="p-1">
        <DropdownMenuItem className="cursor-pointer gap-2">
          <NavSettingsIcon />
          <span>My settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onSelect={() => {
            onLogout?.();
          }}
        >
          <LogOutMenuIcon />
          <span>Log out</span>
        </DropdownMenuItem>
      </div>
    </>
  );
}

function UserFooterShieldCheckIcon(props: React.SVGProps<SVGSVGElement>) {
  const clipId = React.useId().replace(/:/g, "");
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M7.99868 1.33325L8.07734 1.33792L8.11668 1.34325L8.15734 1.35192L8.23134 1.37459C8.28245 1.39343 8.33104 1.41851 8.37601 1.44925L8.44534 1.50392L8.61534 1.64925C9.96022 2.76629 11.6599 3.36612 13.408 3.34059L13.636 3.33392C13.7851 3.32712 13.9321 3.37052 14.0536 3.45718C14.1751 3.54385 14.2639 3.66876 14.306 3.81192C14.6336 4.9263 14.7339 6.09517 14.6008 7.24906C14.4677 8.40296 14.1041 9.51833 13.5314 10.5289C12.9588 11.5395 12.1889 12.4246 11.2674 13.1318C10.3459 13.8389 9.29167 14.3536 8.16734 14.6453C8.0576 14.6737 7.94242 14.6737 7.83268 14.6453C6.70829 14.3537 5.65399 13.839 4.73243 13.1319C3.81088 12.4248 3.04087 11.5397 2.46816 10.5291C1.89546 9.51851 1.53174 8.40312 1.39864 7.24919C1.26554 6.09526 1.36576 4.92635 1.69334 3.81192C1.73542 3.66876 1.8243 3.54385 1.94578 3.45718C2.06725 3.37052 2.21428 3.32712 2.36334 3.33392C4.18832 3.41734 5.97872 2.81658 7.38401 1.64925L7.55934 1.49925L7.62334 1.44925C7.66831 1.41851 7.7169 1.39343 7.76801 1.37459L7.84268 1.35192C7.86881 1.34561 7.8953 1.34093 7.92201 1.33792L7.99868 1.33325ZM10.472 6.19525C10.4101 6.13327 10.3366 6.0841 10.2556 6.05055C10.1747 6.017 10.088 5.99973 10.0003 5.99973C9.91273 5.99973 9.82598 6.017 9.74505 6.05055C9.66412 6.0841 9.59059 6.13327 9.52868 6.19525L7.33334 8.38992L6.47134 7.52859L6.40868 7.47325C6.27468 7.36964 6.10628 7.32092 5.93766 7.33699C5.76904 7.35305 5.61287 7.43269 5.50084 7.55973C5.38882 7.68678 5.32936 7.8517 5.33453 8.021C5.33969 8.1903 5.40911 8.35128 5.52868 8.47125L6.86201 9.80459L6.92468 9.85992C7.05295 9.95942 7.21311 10.0087 7.37513 9.99851C7.53715 9.98832 7.68988 9.91937 7.80468 9.80459L10.4713 7.13792L10.5267 7.07525C10.6262 6.94698 10.6755 6.78682 10.6653 6.6248C10.6551 6.46278 10.5861 6.31005 10.4713 6.19525H10.472Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

const sidebarRowHoverClassName =
  "hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)]";

/** Background on the control that opened a dropdown while the menu is open. */
const sidebarDropdownTriggerOpenClassName =
  "data-[state=open]:bg-[rgba(0,0,0,0.05)] dark:data-[state=open]:bg-[rgba(255,255,255,0.08)]";

/** Filled control (toolbar toggle, section +) — default 0.05, hover 0.1; dark analog. */
const sidebarSubtleControlSurfaceClassName =
  "bg-[rgba(0,0,0,0.05)] hover:bg-[rgba(0,0,0,0.1)] dark:bg-[rgba(255,255,255,0.08)] dark:hover:bg-[rgba(255,255,255,0.14)]";

function demoVaultLeading(emoji: string) {
  return (
    <span className="text-base leading-none" aria-hidden>
      {emoji}
    </span>
  );
}

export type OkkeyWorkspaceShellNavPaths = {
  items: string;
  capsules: string;
  monitoring: string;
  tools: string;
  settings: string;
};

export type OkkeyWorkspaceShellNavLabels = Partial<{
  allItems: string;
  capsules: string;
  monitoring: string;
  tools: string;
  settings: string;
  addRecords: string;
  addCapsule: string;
}>;

const defaultShellNavLabels: Required<OkkeyWorkspaceShellNavLabels> = {
  allItems: "All items",
  capsules: "Capsules",
  monitoring: "Monitoring",
  tools: "Tools",
  settings: "Settings",
  addRecords: "Add records",
  addCapsule: "Add capsule",
};

/**
 * Primary workspace nav rows for the app shell (with optional `to` paths for SPA routing).
 * Without `paths`, rows render as non-navigating buttons (design / gallery default).
 */
export function okkeyWorkspaceShellNavItems(
  paths?: OkkeyWorkspaceShellNavPaths,
  labels?: OkkeyWorkspaceShellNavLabels,
): OkkeySidebarWorkspaceNavItem[] {
  const L = { ...defaultShellNavLabels, ...labels };
  const p = paths;
  return [
    {
      id: "all",
      to: p?.items,
      icon: <NavRecordsIcon />,
      label: L.allItems,
      trailingPlus: true,
      addAriaLabel: L.addRecords,
    },
    {
      id: "cap",
      to: p?.capsules,
      icon: <NavCapsulesIcon />,
      label: L.capsules,
      trailingPlus: true,
      addAriaLabel: L.addCapsule,
    },
    {
      id: "mon",
      to: p?.monitoring,
      icon: <NavMonitoringIcon />,
      label: L.monitoring,
    },
    {
      id: "tools",
      to: p?.tools,
      icon: <NavToolsIcon />,
      label: L.tools,
    },
    {
      id: "set",
      to: p?.settings,
      icon: <NavSettingsIcon />,
      label: L.settings,
    },
  ];
}

function demoVaultItems(): OkkeySidebarVaultItem[] {
  return [
    { id: "p", leading: demoVaultLeading("🏠"), label: "Personal" },
    {
      id: "e",
      leading: demoVaultLeading("💼"),
      label: "Engineering",
      rightIcon: <UsersIcon className="size-4 shrink-0 text-muted-foreground" />,
    },
    {
      id: "m",
      leading: demoVaultLeading("🎨"),
      label: "Marketing",
      rightIcon: <UsersIcon className="size-4 shrink-0 text-muted-foreground" />,
    },
    {
      id: "c",
      leading: demoVaultLeading("🏡"),
      label: "Company",
      rightIcon: <UsersIcon className="size-4 shrink-0 text-muted-foreground" />,
    },
    {
      id: "cl",
      leading: demoVaultLeading("🧳"),
      label: "Clients",
      rightIcon: <UsersIcon className="size-4 shrink-0 text-muted-foreground" />,
    },
  ];
}

const DEMO_FOLDER_TREE: OkkeySidebarFolderTreeNode[] = [
  {
    id: "my",
    label: "My folder",
    defaultOpen: true,
    children: [
      {
        id: "web",
        label: "Web",
        defaultOpen: true,
        children: [
          { id: "design", label: "Design" },
          { id: "frontend", label: "Frontend" },
        ],
      },
      { id: "ai", label: "AI" },
    ],
  },
  { id: "company", label: "Company" },
];

function demoPlainLinkItems(): OkkeySidebarPlainLinkItem[] {
  return [
    { id: "doc", icon: <NavDocumentationIcon />, label: "Documentation" },
    { id: "help", icon: <NavHelpIcon />, label: "Help" },
  ];
}

/** When passed from the host app (e.g. web shell), footer user block + account menu use real identity and logout. */
export type OkkeyAppSidebarAccountMenu = {
  firstName?: string;
  lastName?: string;
  email: string;
  onLogout: () => void;
};

function footerAccountFromProps(accountMenu: OkkeyAppSidebarAccountMenu | undefined) {
  if (accountMenu?.email?.trim()) {
    return {
      firstName: accountMenu.firstName ?? "",
      lastName: accountMenu.lastName ?? "",
      email: accountMenu.email.trim(),
      onLogout: accountMenu.onLogout,
    };
  }
  return {
    firstName: DEMO_PROFILE.firstName,
    lastName: DEMO_PROFILE.lastName,
    email: DEMO_PROFILE.email,
    onLogout: undefined as (() => void) | undefined,
  };
}

export type OkkeyAppSidebarProps = {
  className?: string;
  /** Main column (toolbar with `OkkeyAppSidebarToolbar`, page content). Rendered to the right of the sidebar inside the same `SidebarProvider`. */
  children?: React.ReactNode;
  /** Overrides primary workspace nav; default is non-linked gallery items. */
  workspaceNavItems?: OkkeySidebarWorkspaceNavItem[];
  /** Required when `workspaceNavItems` use `to` (e.g. pass `react-router-dom` `Link`). */
  workspaceNavLink?: OkkeyWorkspaceNavLinkComponent;
  /** Sidebar group label above primary nav (e.g. i18n “Workspace”). */
  workspaceNavGroupLabel?: string;
  /** Replaces workspace header trigger contents (avatar + titles); receives sidebar `expanded`. */
  workspaceSwitcherTrigger?: (ctx: { expanded: boolean }) => React.ReactNode;
  /** Replaces workspace switcher dropdown panel (list + actions). */
  workspaceSwitcherDropdown?: React.ReactNode;
  /** Vault list; omit for demo data. */
  vaultItems?: OkkeySidebarVaultItem[];
  vaultNavLink?: OkkeyWorkspaceNavLinkComponent;
  vaultSectionTitle?: string;
  /**
   * Folder tree. `undefined` → built-in demo tree (gallery). `[]` → hide folders (`showFolders` is length-based).
   * In the web app, pass real nodes with leaf `to` (e.g. `/items?folder=…`) and optional `children` for nested labels.
   */
  folderTree?: OkkeySidebarFolderTreeNode[];
  /** Required on leaves when `folderTree` nodes use `to` (e.g. React Router `Link` wrapper). */
  folderNavLink?: OkkeyWorkspaceNavLinkComponent;
  folderSectionTitle?: string;
  /** Real user row + account dropdown + working logout; omit for gallery / demo footer copy. */
  accountMenu?: OkkeyAppSidebarAccountMenu;
  /** When set, footer Documentation / Help use these strings (e.g. i18n); otherwise English gallery labels. */
  footerPlainLinkLabels?: { documentation: string; help: string };
  /** `aria-label` + tooltip for the vaults section “+” (expanded + collapsed dropdown). Default: gallery English. */
  vaultHeaderPlusAriaLabel?: string;
  /** `aria-label` + tooltip for the folders section “+” (expanded + collapsed dropdown). Default: gallery English. */
  folderHeaderPlusAriaLabel?: string;
  /** Narrow viewport: close control on the drawer panel (`aria-label`). Default: English. */
  mobileNavCloseLabel?: string;
};

export type OkkeyAppSidebarToolbarProps = {
  className?: string;
  /** Shown when the sidebar is collapsed (expand action). Default: English. */
  expandSidebarLabel?: string;
  /** Shown when the sidebar is expanded (collapse action). Default: English. */
  collapseSidebarLabel?: string;
  /**
   * Narrow viewport (&lt; 991px): burger opens the drawer; this labels the control (tooltip + `aria-label`).
   * Defaults to {@link expandSidebarLabel}.
   */
  openMobileNavLabel?: string;
};

/**
 * Radix `TooltipTrigger` opens on `pointermove` on the trigger node. Composing `asChild` only with
 * `SidebarMenuButton asChild` + router `Link` (or nested dropdown triggers) can leave hover on a
 * descendant that never receives the composed trigger props — wrap in a real `span` host.
 */
function SidebarCollapsedTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="inline-flex w-full min-w-0 justify-center">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function CollapsedDropdownIconTooltip({
  label,
  children,
  /** `compact` — квадратные контролы в шапке/футере; `menuRow` — полная ширина ряла как у `SidebarMenuButton` */
  variant = "menuRow",
}: {
  label: string;
  children: React.ReactNode;
  variant?: "menuRow" | "compact";
}) {
  const wrapClassName =
    variant === "compact" ? "inline-flex shrink-0" : "inline-flex w-full min-w-0 justify-center";
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className={wrapClassName}>{children}</span>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function OkkeyAppSidebarToolbar({
  className,
  expandSidebarLabel = "Expand sidebar",
  collapseSidebarLabel = "Collapse sidebar",
  openMobileNavLabel,
}: OkkeyAppSidebarToolbarProps) {
  const shell = useOkkeyAppShellLayout();
  const { expanded, toggleSidebar } = useSidebar();
  const toggleLabel = expanded ? collapseSidebarLabel : expandSidebarLabel;
  const mobileNavLabel = openMobileNavLabel ?? expandSidebarLabel;

  if (shell.isMobile) {
    return (
      <div className={cn("flex shrink-0 flex-col border-0 pb-0 pt-2 px-2", className)}>
        <div className="flex h-9 min-h-9 items-center">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={sidebarSubtleControlSurfaceClassName}
                  onClick={() => shell.setMobileDrawerOpen(true)}
                  aria-expanded={shell.mobileDrawerOpen}
                  aria-label={mobileNavLabel}
                >
                  <MenuBurgerIcon />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              {mobileNavLabel}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex shrink-0 flex-col border-0 pb-0 pt-2 px-2", className)}>
      <div className="flex h-9 min-h-9 items-center">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={sidebarSubtleControlSurfaceClassName}
                onClick={toggleSidebar}
                aria-expanded={expanded}
                aria-label={toggleLabel}
              >
                <SidebarPanelToggleIcon />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            {toggleLabel}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function CollapsedPrimaryNavRow({
  item,
  linkComponent,
}: {
  item: OkkeySidebarWorkspaceNavItem;
  linkComponent?: OkkeyWorkspaceNavLinkComponent;
}) {
  const compact = "h-9 min-h-9 justify-center px-0";
  const srOnly = <span className="sr-only">{item.label}</span>;
  const LinkC = linkComponent;
  const button =
    item.to && LinkC ? (
      <SidebarMenuButton asChild isActive={item.isActive} className={compact}>
        <LinkC to={item.to}>
          {item.icon}
          {srOnly}
        </LinkC>
      </SidebarMenuButton>
    ) : (
      <SidebarMenuButton type="button" isActive={item.isActive} className={compact}>
        {item.icon}
        {srOnly}
      </SidebarMenuButton>
    );
  return (
    <SidebarMenuItem>
      <SidebarCollapsedTooltip label={item.label}>{button}</SidebarCollapsedTooltip>
    </SidebarMenuItem>
  );
}

function DefaultWorkspaceSwitcherTrigger({ expanded }: { expanded: boolean }) {
  return (
    <>
      <div className={cn("shrink-0 overflow-hidden rounded-lg", expanded ? "size-8" : "size-9")}>
        <PersonalWorkspaceMark fillColor={SIDEBAR_WORKSPACE_TILE_COLOR} className="block size-full" />
      </div>
      {expanded ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-5 text-foreground">Okkey team</p>
            <p className="truncate text-xs font-normal leading-4 text-muted-foreground">Enterprise</p>
          </div>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </>
      ) : null}
    </>
  );
}

function OkkeyAppSidebarInner({
  className,
  workspaceNavItems,
  workspaceNavLink,
  workspaceNavGroupLabel,
  workspaceSwitcherTrigger,
  workspaceSwitcherDropdown,
  vaultItems,
  vaultNavLink,
  vaultSectionTitle,
  folderTree,
  folderNavLink,
  folderSectionTitle,
  accountMenu,
  footerPlainLinkLabels,
  vaultHeaderPlusAriaLabel = "Add vault",
  folderHeaderPlusAriaLabel = "Add folder",
  mobileNavCloseLabel = "Close menu",
}: Pick<
  OkkeyAppSidebarProps,
  | "className"
  | "workspaceNavItems"
  | "workspaceNavLink"
  | "workspaceNavGroupLabel"
  | "workspaceSwitcherTrigger"
  | "workspaceSwitcherDropdown"
  | "vaultItems"
  | "vaultNavLink"
  | "vaultSectionTitle"
  | "folderTree"
  | "folderNavLink"
  | "folderSectionTitle"
  | "accountMenu"
  | "footerPlainLinkLabels"
  | "vaultHeaderPlusAriaLabel"
  | "folderHeaderPlusAriaLabel"
  | "mobileNavCloseLabel"
>) {
  const { expanded } = useSidebar();
  const shell = useOkkeyAppShellLayout();
  const showExpanded = shell.isMobile || expanded;
  const [safesOpen, setSafesOpen] = React.useState(true);
  const footerAccount = footerAccountFromProps(accountMenu);
  const footerNameLine = [footerAccount.firstName.trim(), footerAccount.lastName.trim()].filter(Boolean).join(" ");
  const footerPlainItems = React.useMemo((): OkkeySidebarPlainLinkItem[] => {
    const base = demoPlainLinkItems();
    if (!footerPlainLinkLabels) return base;
    return base.map((item) => {
      if (item.id === "doc") return { ...item, label: footerPlainLinkLabels.documentation };
      if (item.id === "help") return { ...item, label: footerPlainLinkLabels.help };
      return item;
    });
  }, [footerPlainLinkLabels]);
  const primaryNav = workspaceNavItems ?? okkeyWorkspaceShellNavItems();
  const groupLabel = workspaceNavGroupLabel ?? "Workspace";
  const vaultData = vaultItems ?? demoVaultItems();
  const folderData = folderTree === undefined ? DEMO_FOLDER_TREE : folderTree;
  const showFolders = folderData.length > 0;
  const vaultTitle = vaultSectionTitle ?? "Vaults";
  const folderTitle = folderSectionTitle ?? "Folders";

  return (
    <div
      className={cn(
        "flex min-h-0 shrink-0 flex-col",
        shell.isMobile ? "relative h-full w-full" : "h-full min-h-0",
      )}
    >
      <Sidebar
        className={cn(
          "border-0 bg-transparent",
          className,
          shell.isMobile && "h-full min-h-0 !w-full shrink-0 bg-sidebar",
        )}
      >
      <SidebarHeader>
        <DropdownMenu>
          {showExpanded ? (
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center rounded-lg text-left outline-none ring-sidebar-ring transition focus-visible:ring-2",
                  sidebarRowHoverClassName,
                  sidebarDropdownTriggerOpenClassName,
                  "w-full gap-2 p-2",
                )}
              >
                {workspaceSwitcherTrigger ? (
                  workspaceSwitcherTrigger({ expanded: showExpanded })
                ) : (
                  <DefaultWorkspaceSwitcherTrigger expanded={showExpanded} />
                )}
              </button>
            </DropdownMenuTrigger>
          ) : (
            <CollapsedDropdownIconTooltip label={groupLabel} variant="compact">
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center rounded-lg text-left outline-none ring-sidebar-ring transition focus-visible:ring-2",
                    sidebarRowHoverClassName,
                    sidebarDropdownTriggerOpenClassName,
                    "h-9 w-9 min-h-9 min-w-9 shrink-0 justify-center p-0",
                  )}
                >
                  {workspaceSwitcherTrigger ? (
                    workspaceSwitcherTrigger({ expanded: showExpanded })
                  ) : (
                    <DefaultWorkspaceSwitcherTrigger expanded={showExpanded} />
                  )}
                </button>
              </DropdownMenuTrigger>
            </CollapsedDropdownIconTooltip>
          )}
          <DropdownMenuContent
            side={shell.isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={shell.isMobile ? 4 : 6}
            collisionPadding={shell.isMobile ? 12 : 8}
            className={cn(
              "p-0",
              shell.isMobile
                ? "max-h-[min(28rem,72dvh)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto"
                : "w-72",
            )}
          >
            {workspaceSwitcherDropdown ?? <WorkspaceSwitcherDropdownPanel />}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <div className="flex flex-col gap-6 p-2">
            {!showExpanded ? (
              <SidebarMenu>
                {primaryNav.map((item) => (
                  <CollapsedPrimaryNavRow key={item.id} item={item} linkComponent={workspaceNavLink} />
                ))}
                <SidebarMenuItem>
                  <DropdownMenu>
                    <CollapsedDropdownIconTooltip label={vaultTitle}>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                          type="button"
                          className={cn(
                            "h-9 min-h-9 justify-center px-0",
                            sidebarDropdownTriggerOpenClassName,
                          )}
                        >
                          <NavSafesIcon />
                          <span className="sr-only">{vaultTitle}</span>
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                    </CollapsedDropdownIconTooltip>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      sideOffset={6}
                      className={collapsedSectionDropdownContentClassName}
                    >
                      <OkkeySidebarVaultsMenu
                        surface="dropdown"
                        sectionTitle={vaultTitle}
                        collapsibleGroupName="vaults-dd"
                        items={vaultData}
                        showHeaderPlus
                        headerPlusAriaLabel={vaultHeaderPlusAriaLabel}
                        linkComponent={vaultNavLink}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
                {showFolders ? (
                  <SidebarMenuItem>
                    <DropdownMenu>
                      <CollapsedDropdownIconTooltip label={folderTitle}>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuButton
                            type="button"
                            className={cn(
                              "h-9 min-h-9 justify-center px-0",
                              sidebarDropdownTriggerOpenClassName,
                            )}
                          >
                            <FolderClosedIcon />
                            <span className="sr-only">{folderTitle}</span>
                          </SidebarMenuButton>
                        </DropdownMenuTrigger>
                      </CollapsedDropdownIconTooltip>
                      <DropdownMenuContent
                        side="right"
                        align="start"
                        sideOffset={6}
                        className={collapsedSectionDropdownContentClassName}
                      >
                        <OkkeySidebarFoldersMenu
                          surface="dropdown"
                          sectionTitle={folderTitle}
                          collapsibleGroupName="folders-dd"
                          tree={folderData}
                          leafIcon={<FolderClosedIcon />}
                          showHeaderPlus
                          headerPlusAriaLabel={folderHeaderPlusAriaLabel}
                          linkComponent={folderNavLink}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            ) : (
              <>
                <OkkeySidebarWorkspaceMenu
                  labelText={groupLabel}
                  items={primaryNav}
                  linkComponent={workspaceNavLink}
                />

                <div className={cn("flex flex-col", safesOpen ? "gap-6" : "gap-2")}>
                  <OkkeySidebarVaultsMenu
                    surface="sidebar-expanded"
                    sectionTitle={vaultTitle}
                    collapsibleGroupName="collapsible"
                    open={safesOpen}
                    onOpenChange={setSafesOpen}
                    items={vaultData}
                    showHeaderPlus
                    headerPlusAriaLabel={vaultHeaderPlusAriaLabel}
                    linkComponent={vaultNavLink}
                  />
                  {showFolders ? (
                    <OkkeySidebarFoldersMenu
                      surface="sidebar-expanded"
                      sectionTitle={folderTitle}
                      collapsibleGroupName="collapsible-folders"
                      tree={folderData}
                      leafIcon={<FolderClosedIcon />}
                      showHeaderPlus
                      headerPlusAriaLabel={folderHeaderPlusAriaLabel}
                      linkComponent={folderNavLink}
                    />
                  ) : null}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <div className="mt-auto shrink-0 p-2">
          {!showExpanded ? (
            <SidebarMenu>
              {footerPlainItems.map((link) => (
                <SidebarMenuItem key={link.id}>
                  <SidebarCollapsedTooltip label={link.label}>
                    <SidebarMenuButton type="button" className="h-9 min-h-9 justify-center px-0">
                      {link.icon}
                      <span className="sr-only">{link.label}</span>
                    </SidebarMenuButton>
                  </SidebarCollapsedTooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          ) : (
            <OkkeySidebarPlainLinksMenu items={footerPlainItems} />
          )}
        </div>
      </SidebarContent>

      <SidebarFooter>
        <DropdownMenu>
          {showExpanded ? (
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center rounded-lg text-left outline-none ring-sidebar-ring transition focus-visible:ring-2",
                  sidebarRowHoverClassName,
                  sidebarDropdownTriggerOpenClassName,
                  "w-full gap-2 p-2",
                )}
              >
                <div
                  className={cn(
                    "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-amber-500 text-white",
                    "size-8",
                  )}
                >
                  <UserFooterShieldCheckIcon className="shrink-0" />
                  <span className="text-[10px] font-semibold leading-none">48</span>
                </div>
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-5 text-foreground">
                      {footerNameLine || footerAccount.email}
                    </p>
                    {footerNameLine ? (
                      <p className="truncate text-xs font-normal leading-4 text-muted-foreground">{footerAccount.email}</p>
                    ) : null}
                  </div>
                  <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
                </>
              </button>
            </DropdownMenuTrigger>
          ) : (
            <CollapsedDropdownIconTooltip
              label={footerNameLine ? `${footerNameLine} · ${footerAccount.email}` : footerAccount.email}
              variant="compact"
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center rounded-lg text-left outline-none ring-sidebar-ring transition focus-visible:ring-2",
                    sidebarRowHoverClassName,
                    sidebarDropdownTriggerOpenClassName,
                    "h-9 w-9 min-h-9 min-w-9 shrink-0 justify-center p-0",
                  )}
                >
                  <div
                    className={cn(
                      "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-amber-500 text-white",
                      "size-9",
                    )}
                  >
                    <UserFooterShieldCheckIcon className="shrink-0" />
                    <span className="text-[10px] font-semibold leading-none">48</span>
                  </div>
                  <span className="sr-only">
                    {footerNameLine ? `${footerNameLine}, ${footerAccount.email}` : footerAccount.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
            </CollapsedDropdownIconTooltip>
          )}
          <DropdownMenuContent
            side={shell.isMobile ? "bottom" : "right"}
            align={shell.isMobile ? "start" : "end"}
            sideOffset={shell.isMobile ? 4 : 6}
            collisionPadding={shell.isMobile ? 12 : 8}
            className={cn(
              "p-0",
              shell.isMobile
                ? "max-h-[min(24rem,72dvh)] w-[min(16rem,calc(100vw-1.5rem))] overflow-y-auto"
                : "w-64",
            )}
          >
            <ProfileAccountDropdownPanel
              firstName={footerAccount.firstName}
              lastName={footerAccount.lastName}
              email={footerAccount.email}
              onLogout={footerAccount.onLogout}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
    </div>
  );
}

/**
 * OKKEY app shell: `SidebarProvider`, sidebar panel, and optional main column (`children`).
 * Put `OkkeyAppSidebarToolbar` in the main column for the collapse control.
 */
/** Persisted by {@link SidebarProvider} `persistExpandedStorageKey` so collapse survives navigations. */
const OKKEY_APP_SHELL_SIDEBAR_EXPANDED_KEY = "okkey.appShell.sidebarExpanded";

export function OkkeyAppSidebar({
  className,
  children,
  workspaceNavItems,
  workspaceNavLink,
  workspaceNavGroupLabel,
  workspaceSwitcherTrigger,
  workspaceSwitcherDropdown,
  vaultItems,
  vaultNavLink,
  vaultSectionTitle,
  folderTree,
  folderNavLink,
  folderSectionTitle,
  accountMenu,
  footerPlainLinkLabels,
  vaultHeaderPlusAriaLabel,
  folderHeaderPlusAriaLabel,
  mobileNavCloseLabel,
}: OkkeyAppSidebarProps) {
  const isMobile = useOkkeyAppShellIsMobile();
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isMobile) {
      setMobileDrawerOpen(false);
    }
  }, [isMobile]);

  React.useEffect(() => {
    if (!isMobile || !mobileDrawerOpen) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobile, mobileDrawerOpen]);

  const shellLayoutValue = React.useMemo(
    () => ({
      isMobile,
      mobileDrawerOpen,
      setMobileDrawerOpen,
    }),
    [isMobile, mobileDrawerOpen],
  );

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <SidebarProvider persistExpandedStorageKey={OKKEY_APP_SHELL_SIDEBAR_EXPANDED_KEY}>
        <OkkeyAppShellLayoutContext.Provider value={shellLayoutValue}>
          <div className="relative flex h-full min-h-0 w-full">
            {isMobile && mobileDrawerOpen ? (
              <button
                type="button"
                className="fixed inset-0 z-[90] cursor-default border-0 bg-black/40 p-0"
                aria-label={mobileNavCloseLabel ?? "Close menu"}
                onClick={() => setMobileDrawerOpen(false)}
              />
            ) : null}
            {!isMobile ? (
              <div className="relative z-auto flex h-full min-h-0 w-auto shrink-0 flex-col">
                <OkkeyAppSidebarInner
                  className={className}
                  workspaceNavItems={workspaceNavItems}
                  workspaceNavLink={workspaceNavLink}
                  workspaceNavGroupLabel={workspaceNavGroupLabel}
                  workspaceSwitcherTrigger={workspaceSwitcherTrigger}
                  workspaceSwitcherDropdown={workspaceSwitcherDropdown}
                  vaultItems={vaultItems}
                  vaultNavLink={vaultNavLink}
                  vaultSectionTitle={vaultSectionTitle}
                  folderTree={folderTree}
                  folderNavLink={folderNavLink}
                  folderSectionTitle={folderSectionTitle}
                  accountMenu={accountMenu}
                  footerPlainLinkLabels={footerPlainLinkLabels}
                  vaultHeaderPlusAriaLabel={vaultHeaderPlusAriaLabel}
                  folderHeaderPlusAriaLabel={folderHeaderPlusAriaLabel}
                  mobileNavCloseLabel={mobileNavCloseLabel}
                />
              </div>
            ) : (
              <div
                className={cn(
                  "fixed inset-y-0 left-0 z-[100] flex h-full w-max max-w-[calc(100vw-8px)] flex-row items-start transition-transform duration-200 ease-out will-change-transform",
                  !mobileDrawerOpen && "-translate-x-full pointer-events-none",
                  mobileDrawerOpen && "translate-x-0 pointer-events-auto",
                )}
              >
                <div className="relative h-full w-[min(255px,calc(100vw-52px))] max-w-[calc(100vw-52px)] shrink-0 overflow-hidden bg-sidebar shadow-xl">
                  <OkkeyAppSidebarInner
                    className={className}
                    workspaceNavItems={workspaceNavItems}
                    workspaceNavLink={workspaceNavLink}
                    workspaceNavGroupLabel={workspaceNavGroupLabel}
                    workspaceSwitcherTrigger={workspaceSwitcherTrigger}
                    workspaceSwitcherDropdown={workspaceSwitcherDropdown}
                    vaultItems={vaultItems}
                    vaultNavLink={vaultNavLink}
                    vaultSectionTitle={vaultSectionTitle}
                    folderTree={folderTree}
                    folderNavLink={folderNavLink}
                    folderSectionTitle={folderSectionTitle}
                    accountMenu={accountMenu}
                    footerPlainLinkLabels={footerPlainLinkLabels}
                    vaultHeaderPlusAriaLabel={vaultHeaderPlusAriaLabel}
                    folderHeaderPlusAriaLabel={folderHeaderPlusAriaLabel}
                    mobileNavCloseLabel={mobileNavCloseLabel}
                  />
                </div>
                {mobileDrawerOpen ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="mt-2 ml-1.5 shrink-0 rounded-lg border-0 bg-transparent text-white shadow-none hover:bg-white/15 hover:text-white focus-visible:bg-white/15 focus-visible:text-white"
                    onClick={() => setMobileDrawerOpen(false)}
                    aria-label={mobileNavCloseLabel ?? "Close menu"}
                  >
                    <CloseNavIcon />
                  </Button>
                ) : null}
              </div>
            )}
            <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
          </div>
        </OkkeyAppShellLayoutContext.Provider>
      </SidebarProvider>
    </TooltipProvider>
  );
}
