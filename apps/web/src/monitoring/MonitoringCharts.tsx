import { cn } from "@okkey/ui";

type GaugeChartProps = {
  score: number;
  className?: string;
};

export function MonitoringGaugeChart({ score, className }: GaugeChartProps) {
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
        className="stroke-muted"
        strokeWidth={stroke}
      />
      <circle
        cx="96"
        cy="96"
        r={radius}
        fill="none"
        className="stroke-lime-500"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${progress} ${circumference}`}
        transform="rotate(-90 96 96)"
      />
    </svg>
  );
}

type DonutSegment = { value: number; className: string };

type DonutChartProps = {
  segments: DonutSegment[];
  className?: string;
};

export function MonitoringDonutChart({ segments, className }: DonutChartProps) {
  const radius = 78;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;
  let offset = 0;

  return (
    <svg viewBox="0 0 192 192" className={cn("size-48", className)} aria-hidden>
      <circle cx="96" cy="96" r={radius} fill="none" className="stroke-muted" strokeWidth={stroke} />
      {segments.map((segment, index) => {
        const length = (Math.max(0, segment.value) / total) * circumference;
        const node = (
          <circle
            key={index}
            cx="96"
            cy="96"
            r={radius}
            fill="none"
            className={segment.className}
            strokeWidth={stroke}
            strokeDasharray={`${length} ${circumference}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 96 96)"
          />
        );
        offset += length;
        return node;
      })}
    </svg>
  );
}

type TrendPoint = { ts: number; score: number };

type TrendChartProps = {
  points: readonly TrendPoint[];
  className?: string;
};

export function MonitoringTrendChart({ points, className }: TrendChartProps) {
  const width = 320;
  const height = 96;
  const padX = 8;
  const padY = 10;
  if (points.length === 0) {
    return (
      <div className={cn("flex h-24 items-center justify-center text-xs text-muted-foreground", className)}>
        —
      </div>
    );
  }

  const scores = points.map((p) => p.score);
  const minScore = Math.min(...scores, 0);
  const maxScore = Math.max(...scores, 100);
  const span = Math.max(1, maxScore - minScore);
  const xs = points.map((_, i) =>
    points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2),
  );
  const ys = points.map(
    (p) => padY + (1 - (p.score - minScore) / span) * (height - padY * 2),
  );
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${ys[i]!.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-24 w-full", className)} aria-hidden>
      <path d={d} fill="none" className="stroke-lime-600" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, i) => (
        <circle key={points[i]!.ts} cx={x} cy={ys[i]} r="3" className="fill-lime-600" />
      ))}
    </svg>
  );
}
