/** Metric roles for autofill form recognition evaluation (TSK-19). */
export type MetricRole = "username" | "password" | "new-password" | "otp";

export const METRIC_ROLES: readonly MetricRole[] = [
  "username",
  "password",
  "new-password",
  "otp",
] as const;

/** Page kinds used for metric (c) false-positive measurement. */
export type CorpusPageKind = "login" | "register" | "search" | "checkout" | "other";

export type InterfaceLang = "RU" | "EN";

/** Field attribute hints captured at annotation / capture time (no third-party HTML). */
export type AnnotationFieldHints = {
  type: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  placeholder?: string;
  ariaLabel?: string;
  labelText?: string;
  inputMode?: string;
  maxLength?: number;
  role?: string;
};

export type AnnotatedField = {
  /** CSS selector unique within the form (or document for orphan groups). */
  selector: string;
  role: MetricRole;
  /** Optional hints so CI can re-run classifyAutofillInput without HTML cache. */
  hints?: AnnotationFieldHints;
};

export type AnnotatedForm = {
  /** Stable id within the page annotation. */
  formId: string;
  /**
   * CSS selector for the `<form>`, or null when annotators treat orphan fields
   * outside `<form>` as one logical form.
   */
  selector: string | null;
  fields: AnnotatedField[];
};

export type PageAnnotation = {
  schemaVersion: 1;
  pageId: string;
  url: string;
  lang: InterfaceLang;
  annotator: "A" | "B";
  /** empty = placeholder awaiting independent annotator B (or unused A). */
  status: "annotated" | "empty" | "blocked" | "uncapturable";
  pageKind: CorpusPageKind;
  forms: AnnotatedForm[];
  notes?: string;
};

export type CorpusSite = {
  domain: string;
  url: string;
  lang: InterfaceLang;
  category: string;
  formTypes: string[];
  notes: string;
  httpStatus: string;
};

export type RoleCounts = {
  tp: number;
  fp: number;
  fn: number;
};

export type RoleMetrics = {
  precision: number | "no data";
  recall: number | "no data";
  f1: number | "no data";
  counts: RoleCounts;
};

export type FormRecognitionMetrics = {
  fullyRecognized: number;
  annotatedForms: number;
  share: number | "no data";
};

export type FalsePositiveMetrics = {
  pagesEvaluated: number;
  pagesWithAnyRole: number;
  share: number | "no data";
  fieldCount: number;
};

export type MetricSlice = {
  formRecognition: FormRecognitionMetrics;
  perRole: Record<MetricRole, RoleMetrics>;
  falsePositives: FalsePositiveMetrics;
};

export type DisagreementEntry = {
  pageId: string;
  url: string;
  formId?: string;
  selector?: string;
  annotatorA?: MetricRole | null;
  annotatorB?: MetricRole | null;
  reason: string;
};

export type MissEntry = {
  pageId: string;
  url: string;
  role: MetricRole;
  kind: "fn" | "fp";
  selector?: string;
};

export type CaptureStatusEntry = {
  pageId: string;
  domain: string;
  url: string;
  lang: InterfaceLang;
  status: "captured" | "blocked" | "timeout" | "error" | "skipped";
  httpStatus?: number | string;
  detail?: string;
  cachedAt?: string;
};

export type MetricsReport = {
  schemaVersion: 1;
  generatedAt: string;
  classifierSha: string;
  classifierFiles: string[];
  runComposition: {
    corpusSites: number;
    pagesWithAnnotatorA: number;
    pagesWithAnnotatorB: number;
    pagesWithAgreement: number;
    pagesBlockedOrUncapturable: number;
    syntheticFixturePages: number;
  };
  overall: MetricSlice;
  byLang: Record<InterfaceLang, MetricSlice>;
  disagreements: DisagreementEntry[];
  misses: MissEntry[];
  captureSummary?: {
    captured: number;
    blocked: number;
    timeout: number;
    error: number;
    skipped: number;
  };
};

export type ThresholdDocument = {
  schemaVersion: 1;
  /** Corpus id — composition change requires a new baseline. */
  corpusId: string;
  corpusSiteCount: number;
  baselineReportPath: string;
  /**
   * CI compares recomputed (or stored) metrics to this baseline.
   * Any regression in (a), (b) precision/recall/F1, (c), or RU slice fails.
   * Equal values pass. No tolerance.
   */
  policy: "not-worse-than-baseline";
};
