import { FaviconImageNormalizeError } from "./faviconImageError";

/** Same cap as the server favicon response limit, with a little headroom. */
const MAX_SVG_BYTES = 512 * 1024;

const DROP_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "embed",
  "object",
  "audio",
  "video",
  "link",
  "style",
  "handler",
  "set",
  "animate",
  "animatetransform",
  "animatemotion",
]);

export function looksLikeSvgBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4 || bytes.byteLength > MAX_SVG_BYTES) {
    return false;
  }
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    start = 3;
  }
  const sample = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(start, Math.min(bytes.byteLength, start + 512)))
    .trimStart()
    .toLowerCase();
  if (sample.startsWith("<svg")) {
    return true;
  }
  if (!sample.startsWith("<?xml")) {
    return false;
  }
  return /<svg[\s>/]/.test(sample) && !/<html[\s>]/.test(sample);
}

function isLocalReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("#") && !trimmed.toLowerCase().includes("javascript:");
}

/**
 * Parse SVG as XML and drop active content before it is drawn to a canvas.
 * DOMParser does not run scripts. The result is still only loaded as an image, never as HTML.
 */
export function sanitizeSvgMarkup(markup: string): string {
  if (markup.length === 0 || markup.length > MAX_SVG_BYTES) {
    throw new FaviconImageNormalizeError("INVALID_IMAGE");
  }
  if (typeof DOMParser === "undefined") {
    throw new FaviconImageNormalizeError("CANVAS_UNAVAILABLE");
  }
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    throw new FaviconImageNormalizeError("INVALID_IMAGE");
  }
  const svg = doc.documentElement;
  if (!svg || svg.localName.toLowerCase() !== "svg") {
    throw new FaviconImageNormalizeError("INVALID_IMAGE");
  }

  const drop: Element[] = [];
  const walker = doc.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT);
  let current: Node | null = walker.currentNode;
  while (current) {
    if (current instanceof Element && DROP_TAGS.has(current.localName.toLowerCase())) {
      drop.push(current);
    }
    current = walker.nextNode();
  }
  for (const node of drop) {
    node.remove();
  }

  const elements = svg.querySelectorAll("*");
  const all = [svg, ...Array.from(elements)];
  for (const element of all) {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on") || name === "style") {
        element.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" || name.endsWith(":href")) {
        if (!isLocalReference(value)) {
          element.removeAttribute(attr.name);
        }
      }
    }
  }

  const previousWidth = svg.getAttribute("width");
  const previousHeight = svg.getAttribute("height");
  if (!svg.getAttribute("viewBox")) {
    const width = Number.parseFloat(previousWidth ?? "");
    const height = Number.parseFloat(previousHeight ?? "");
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    } else {
      svg.setAttribute("viewBox", "0 0 80 80");
    }
  }
  svg.setAttribute("width", "80");
  svg.setAttribute("height", "80");

  return new XMLSerializer().serializeToString(svg);
}
