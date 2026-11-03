import { toPlainText } from "@react-email/render";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const EMAIL_DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

/**
 * Render email HTML without React 18's streaming SSR path.
 *
 * `@react-email/render` uses `renderToPipeableStream` / `renderToReadableStream`.
 * With React 18 those streams can emit raw U+0000 bytes for some multi-byte
 * content lengths (Preview ZW padding, Cyrillic CTAs, etc.). The NUL then
 * appears in HTML and in plain text derived from that HTML. `renderToStaticMarkup`
 * does not have this bug.
 */
export function renderEmailHtml(element: ReactElement): string {
  const markup = renderToStaticMarkup(element);
  return `${EMAIL_DOCTYPE}${markup.replace(/<!DOCTYPE.*?>/, "")}`;
}

export function renderEmailPlainText(element: ReactElement): string {
  return toPlainText(renderToStaticMarkup(element));
}
