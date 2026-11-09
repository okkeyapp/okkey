import { cn } from "@okkey/ui";

type ScoreGaugeChartProps = {
  score: number;
  className?: string;
  /** Progress arc stroke. */
  progressClassName?: string;
  /** Track / empty ring stroke. */
  trackClassName?: string;
};

/** Circular 0–100 score gauge used by account security score. */
export function ScoreGaugeChart({
  score,
  className,
  progressClassName = "stroke-lime-500",
  trackClassName = "stroke-muted",
}: ScoreGaugeChartProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 78;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamped / 100) * circumference;

  return (
    <svg viewBox="0 0 192 192" className={cn("size-48", className)} aria-hidden>
      <circle
        cx="96"
        cy="96"
        r={radius}
        fill="none"
        className={trackClassName}
        strokeWidth={stroke}
      />
      <circle
        cx="96"
        cy="96"
        r={radius}
        fill="none"
        className={progressClassName}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${progress} ${circumference}`}
        transform="rotate(-90 96 96)"
      />
    </svg>
  );
}
