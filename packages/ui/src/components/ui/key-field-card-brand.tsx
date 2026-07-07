import type { CardBrand } from "../../lib/key-field-card.js";
import { cn } from "../../lib/utils.js";

type KeyFieldCardBrandBadgeProps = {
  brand: CardBrand;
  className?: string;
};

type BrandCardStyle = {
  surfaceClassName: string;
  labelClassName: string;
  label: string;
};

const brandCardStyles: Record<Exclude<CardBrand, "unknown" | "mastercard">, BrandCardStyle> = {
  visa: {
    surfaceClassName: "bg-[#1A1F71]",
    labelClassName: "text-[8px] font-bold tracking-[0.14em] text-white",
    label: "VISA",
  },
  mir: {
    surfaceClassName: "bg-[#007452]",
    labelClassName: "text-[8px] font-bold tracking-[0.08em] text-white",
    label: "МИР",
  },
  amex: {
    surfaceClassName: "bg-[#006FCF]",
    labelClassName: "text-[7px] font-bold tracking-[0.08em] text-white",
    label: "AMEX",
  },
  discover: {
    surfaceClassName: "bg-[#FF6000]",
    labelClassName: "text-[7px] font-bold tracking-[0.06em] text-white",
    label: "DISC",
  },
  unionpay: {
    surfaceClassName: "bg-[#E21836]",
    labelClassName: "text-[7px] font-bold tracking-[0.04em] text-white",
    label: "UP",
  },
  jcb: {
    surfaceClassName: "bg-[#0B4EA2]",
    labelClassName: "text-[8px] font-bold tracking-[0.1em] text-white",
    label: "JCB",
  },
  diners: {
    surfaceClassName: "bg-[#004A97]",
    labelClassName: "text-[7px] font-bold tracking-[0.06em] text-white",
    label: "DC",
  },
  maestro: {
    surfaceClassName: "bg-[#0066A1]",
    labelClassName: "text-[7px] font-bold tracking-[0.06em] text-white",
    label: "M",
  },
  elo: {
    surfaceClassName: "bg-[#00A4E0]",
    labelClassName: "text-[8px] font-bold tracking-[0.08em] text-white",
    label: "ELO",
  },
};

const cardBadgeSurfaceClassName =
  "inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-[5px]";

function MastercardMark() {
  return (
    <span className="inline-flex items-center" aria-hidden>
      <span className="size-3 rounded-full bg-[#EB001B]" />
      <span className="-ml-1.5 size-3 rounded-full bg-[#F79E1B]" />
    </span>
  );
}

function UnknownCardIcon({ className }: { className?: string }) {
  return (
    <svg
      width="36"
      height="24"
      viewBox="0 0 36 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("h-6 w-9 shrink-0 text-muted-foreground/40", className)}
    >
      <path
        d="M4.00001 0C1.79375 0 0 1.72969 0 3.85715V5.78572H36V3.85715C36 1.72969 34.2063 0 32 0H4.00001ZM36 9.57143H0L0 20.1428C0 22.2702 1.79375 24 4.00001 24H32C34.2063 24 36 22.2702 36 20.1428V9.57143Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function KeyFieldCardBrandBadge({ brand, className }: KeyFieldCardBrandBadgeProps) {
  if (brand === "unknown") {
    return <UnknownCardIcon className={className} />;
  }

  if (brand === "mastercard") {
    return (
      <span className={cn(cardBadgeSurfaceClassName, "bg-[#252525]", className)} aria-hidden>
        <MastercardMark />
      </span>
    );
  }

  const style = brandCardStyles[brand];

  return (
    <span className={cn(cardBadgeSurfaceClassName, style.surfaceClassName, className)} aria-hidden>
      <span className={style.labelClassName}>{style.label}</span>
    </span>
  );
}
