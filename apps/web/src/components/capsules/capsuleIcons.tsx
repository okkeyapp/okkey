import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function iconProps(props: IconProps): IconProps {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
    ...props,
  };
}

export function CapsuleColumnsIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path
        d="M6 2V14M10 2V14M3.33333 2H12.6667C13.403 2 14 2.59695 14 3.33333V12.6667C14 13.403 13.403 14 12.6667 14H3.33333C2.59695 14 2 13.403 2 12.6667V3.33333C2 2.59695 2.59695 2 3.33333 2Z"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CapsuleMoreIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path
        d="M8.00008 8.66659C8.36827 8.66659 8.66675 8.36811 8.66675 7.99992C8.66675 7.63173 8.36827 7.33325 8.00008 7.33325C7.63189 7.33325 7.33341 7.63173 7.33341 7.99992C7.33341 8.36811 7.63189 8.66659 8.00008 8.66659Z"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6667 8.66659C13.0349 8.66659 13.3334 8.36811 13.3334 7.99992C13.3334 7.63173 13.0349 7.33325 12.6667 7.33325C12.2986 7.33325 12.0001 7.63173 12.0001 7.99992C12.0001 8.36811 12.2986 8.66659 12.6667 8.66659Z"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.33341 8.66659C3.7016 8.66659 4.00008 8.36811 4.00008 7.99992C4.00008 7.63173 3.7016 7.33325 3.33341 7.33325C2.96522 7.33325 2.66675 7.63173 2.66675 7.99992C2.66675 8.36811 2.96522 8.66659 3.33341 8.66659Z"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CapsuleCopyIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path
        d="M4.66663 6.4445C4.66663 5.97295 4.85395 5.52071 5.18739 5.18727C5.52083 4.85383 5.97307 4.6665 6.44463 4.6665H12.222C12.4554 4.6665 12.6867 4.71249 12.9024 4.80185C13.1181 4.8912 13.3141 5.02217 13.4792 5.18727C13.6443 5.35237 13.7753 5.54838 13.8646 5.76409C13.954 5.97981 14 6.21101 14 6.4445V12.2218C14 12.4553 13.954 12.6865 13.8646 12.9022C13.7753 13.118 13.6443 13.314 13.4792 13.4791C13.3141 13.6442 13.1181 13.7751 12.9024 13.8645C12.6867 13.9538 12.4554 13.9998 12.222 13.9998H6.44463C6.21114 13.9998 5.97993 13.9538 5.76421 13.8645C5.5485 13.7751 5.35249 13.6442 5.18739 13.4791C5.02229 13.314 4.89132 13.118 4.80197 12.9022C4.71262 12.6865 4.66663 12.4553 4.66663 12.2218V6.4445Z"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.67467 11.158C2.47023 11.0415 2.30018 10.873 2.18172 10.6697C2.06325 10.4663 2.00057 10.2353 2 10V3.33333C2 2.6 2.6 2 3.33333 2H10C10.5 2 10.772 2.25667 11 2.66667"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CapsuleDeleteIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path
        d="M2 4.00016H14M12.6667 4.00016V13.3335C12.6667 14.0002 12 14.6668 11.3333 14.6668H4.66667C4 14.6668 3.33333 14.0002 3.33333 13.3335V4.00016M5.33333 4.00016V2.66683C5.33333 2.00016 6 1.3335 6.66667 1.3335H9.33333C10 1.3335 10.6667 2.00016 10.6667 2.66683V4.00016M6.66667 7.3335V11.3335M9.33333 7.3335V11.3335"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CapsuleDeactivateIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path
        d="M3.5 3.16667C3.5 2.98986 3.57024 2.82029 3.69526 2.69526C3.82029 2.57024 3.98986 2.5 4.16667 2.5H5.83333C6.01014 2.5 6.17971 2.57024 6.30474 2.69526C6.42976 2.82029 6.5 2.98986 6.5 3.16667V12.8333C6.5 13.0101 6.42976 13.1797 6.30474 13.3047C6.17971 13.4298 6.01014 13.5 5.83333 13.5H4.16667C3.98986 13.5 3.82029 13.4298 3.69526 13.3047C3.57024 13.1797 3.5 13.0101 3.5 12.8333V3.16667Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 3.16667C9.5 2.98986 9.57024 2.82029 9.69526 2.69526C9.82029 2.57024 9.98986 2.5 10.1667 2.5H11.8333C12.0101 2.5 12.1797 2.57024 12.3047 2.69526C12.4298 2.82029 12.5 2.98986 12.5 3.16667V12.8333C12.5 13.0101 12.4298 13.1797 12.3047 13.3047C12.1797 13.4298 12.0101 13.5 11.8333 13.5H10.1667C9.98986 13.5 9.82029 13.4298 9.69526 13.3047C9.57024 13.1797 9.5 13.0101 9.5 12.8333V3.16667Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CapsuleCheckIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CapsuleActivateIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path
        d="M4.5 2.5V13.5L13.5 8L4.5 2.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
