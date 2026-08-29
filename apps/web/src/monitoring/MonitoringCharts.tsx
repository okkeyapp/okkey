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
  const cx = 96;
  const cy = 96;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;

  let offset = 0;
  const arcs = segments.map((segment, index) => {
    const length = (Math.max(0, segment.value) / total) * circumference;
    const startOffset = offset;
    offset += length;
    return { index, className: segment.className, length, startOffset };
  });

  return (
    <svg viewBox="0 0 192 192" className={cn("size-48", className)} aria-hidden>
      <circle cx={cx} cy={cy} r={radius} fill="none" className="stroke-muted" strokeWidth={stroke} />
      {arcs.map((arc) =>
        arc.length > 0 ? (
          <circle
            key={`arc-${arc.index}`}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            className={arc.className}
            strokeWidth={stroke}
            strokeDasharray={`${arc.length} ${circumference}`}
            strokeDashoffset={-arc.startOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ) : null,
      )}
      {/* Rounded leading cap overlaps the previous segment's flat tail (same stroke classes). */}
      {arcs.map((arc) =>
        arc.length > 0 ? (
          <circle
            key={`cap-${arc.index}`}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            className={arc.className}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`0.01 ${circumference}`}
            strokeDashoffset={-arc.startOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ) : null,
      )}
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
