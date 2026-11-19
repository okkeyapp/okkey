/**
 * Dual-annotator page files under annotations/pages/<pageId>/:
 *   annotator-a.json / annotator-b.json
 * A field/form enters metric denominators only when both agree (same formId,
 * selectors, roles). status: annotated | empty | blocked | uncapturable.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ANNOTATIONS_DIR, annotatorPath, pageAnnotationDir } from "./paths.ts";
import type { InterfaceLang, PageAnnotation } from "./types.ts";

export function emptyAnnotatorB(pageId: string, url: string, lang: InterfaceLang): PageAnnotation {
  return {
    schemaVersion: 1,
    pageId,
    url,
    lang,
    annotator: "B",
    status: "empty",
    pageKind: "other",
    forms: [],
    notes: "Reserved for independent annotator B.",
  };
}

export function readAnnotation(filePath: string): PageAnnotation | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as PageAnnotation;
  if (raw.schemaVersion !== 1) {
    throw new Error(`Unsupported annotation schemaVersion in ${filePath}`);
  }
  return raw;
}

export function writeAnnotation(annotation: PageAnnotation): void {
  const dir = pageAnnotationDir(annotation.pageId);
  mkdirSync(dir, { recursive: true });
  const file = annotatorPath(annotation.pageId, annotation.annotator);
  writeFileSync(file, `${JSON.stringify(annotation, null, 2)}\n`, "utf8");
}

export function ensureAnnotatorBStub(pageId: string, url: string, lang: InterfaceLang): void {
  const file = annotatorPath(pageId, "B");
  if (existsSync(file)) {
    return;
  }
  writeAnnotation(emptyAnnotatorB(pageId, url, lang));
}

export type PageAnnotationPair = {
  pageId: string;
  a: PageAnnotation | null;
  b: PageAnnotation | null;
};

export function listAnnotationPageIds(): string[] {
  if (!existsSync(ANNOTATIONS_DIR)) {
    return [];
  }
  return readdirSync(ANNOTATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadAnnotationPair(pageId: string): PageAnnotationPair {
  return {
    pageId,
    a: readAnnotation(annotatorPath(pageId, "A")),
    b: readAnnotation(annotatorPath(pageId, "B")),
  };
}

export function loadAllAnnotationPairs(): PageAnnotationPair[] {
  return listAnnotationPageIds().map(loadAnnotationPair);
}

/** Validate structural consistency of an annotation file. */
export function validateAnnotation(annotation: PageAnnotation): string[] {
  const errors: string[] = [];
  if (annotation.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (!annotation.pageId) {
    errors.push("pageId required");
  }
  if (annotation.annotator !== "A" && annotation.annotator !== "B") {
    errors.push("annotator must be A or B");
  }
  if (!["annotated", "empty", "blocked", "uncapturable"].includes(annotation.status)) {
    errors.push(`invalid status: ${annotation.status}`);
  }
  if (annotation.status === "empty" && annotation.forms.length > 0) {
    errors.push("empty annotation must not contain forms");
  }
  if (annotation.status === "annotated") {
    for (const form of annotation.forms) {
      if (!form.formId) {
        errors.push("form.formId required");
      }
      for (const field of form.fields) {
        if (!field.selector) {
          errors.push(`field selector required in form ${form.formId}`);
        }
        if (!["username", "password", "new-password", "otp"].includes(field.role)) {
          errors.push(`invalid role ${field.role} on ${field.selector}`);
        }
      }
    }
  }
  return errors;
}

export function validateAllAnnotations(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const pageId of listAnnotationPageIds()) {
    for (const who of ["A", "B"] as const) {
      const file = annotatorPath(pageId, who);
      if (!existsSync(file)) {
        continue;
      }
      try {
        const annotation = readAnnotation(file);
        if (!annotation) {
          continue;
        }
        for (const err of validateAnnotation(annotation)) {
          errors.push(`${path.relative(ANNOTATIONS_DIR, file)}: ${err}`);
        }
      } catch (error) {
        errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
