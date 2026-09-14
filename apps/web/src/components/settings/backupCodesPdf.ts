/**
 * Client-side PDF for backup codes: Okkey mark + localized text + code list.
 * Uses pdf-lib + embedded DejaVu Sans so Cyrillic titles stay real vector text.
 */

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

import dejavuSansUrl from "../../assets/DejaVuSans.ttf?url";
import okkeyMarkUrl from "../../assets/okkey-mark.png?url";

export type BackupCodesPdfCopy = {
  title: string;
  description: string;
};

async function loadAssetBytes(assetUrl: string, moduleRelativePath: string): Promise<Uint8Array> {
  try {
    const response = await fetch(assetUrl);
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    }
  } catch {
    /* fall through to filesystem (vitest / node) */
  }
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = fileURLToPath(new URL(moduleRelativePath, import.meta.url));
  return new Uint8Array(readFileSync(path));
}

function wrapTextByWidth(
  text: string,
  font: { widthOfTextAtSize: (value: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i]!;
    const next = `${current} ${word}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export async function buildBackupCodesPdfBytes(
  codes: string[],
  copy: BackupCodesPdfCopy,
): Promise<Uint8Array> {
  const [fontBytes, logoBytes] = await Promise.all([
    loadAssetBytes(dejavuSansUrl, "../../assets/DejaVuSans.ttf"),
    loadAssetBytes(okkeyMarkUrl, "../../assets/okkey-mark.png"),
  ]);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const logo = await pdf.embedPng(logoBytes);
  const page = pdf.addPage([612, 792]);
  const { width, height } = page.getSize();

  const marginX = 50;
  const contentWidth = width - marginX * 2;
  let cursorY = height - 56;

  const logoSize = 48;
  page.drawImage(logo, {
    x: marginX,
    y: cursorY - logoSize,
    width: logoSize,
    height: logoSize,
  });
  cursorY -= logoSize + 20;

  const titleSize = 18;
  const titleLines = wrapTextByWidth(copy.title, font, titleSize, contentWidth);
  for (const line of titleLines) {
    page.drawText(line, {
      x: marginX,
      y: cursorY - titleSize,
      size: titleSize,
      font,
      color: rgb(0.04, 0.04, 0.04),
    });
    cursorY -= titleSize + 6;
  }

  cursorY -= 6;
  const descriptionSize = 11;
  const descriptionLines = wrapTextByWidth(copy.description, font, descriptionSize, contentWidth);
  for (const line of descriptionLines) {
    page.drawText(line, {
      x: marginX,
      y: cursorY - descriptionSize,
      size: descriptionSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    cursorY -= descriptionSize + 4;
  }

  cursorY -= 16;
  const codeSize = 12;
  for (const code of codes) {
    page.drawText(code, {
      x: marginX,
      y: cursorY - codeSize,
      size: codeSize,
      font,
      color: rgb(0.04, 0.04, 0.04),
    });
    cursorY -= codeSize + 8;
    if (cursorY < 48) {
      break;
    }
  }

  return pdf.save();
}

export async function downloadBackupCodesPdf(
  codes: string[],
  copy: BackupCodesPdfCopy,
  fileName = "okkey-backup-codes.pdf",
): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
  const bytes = await buildBackupCodesPdfBytes(codes, copy);
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function formatBackupCodesForClipboard(codes: string[]): string {
  return codes.join("\n");
}
