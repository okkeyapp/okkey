import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DeviceClientOsLabel } from "./device-client-os-label.js";

function textOf(value: string): string {
  return renderToStaticMarkup(<DeviceClientOsLabel value={value} />).replace(/<[^>]+>/g, "");
}

describe("DeviceClientOsLabel", () => {
  it("keeps the readable subtitle text", () => {
    expect(textOf("Web · Yandex · macOS")).toBe("Web · Yandex · macOS");
  });

  it("wraps each segment in whitespace-nowrap spans so separators cannot orphan", () => {
    const html = renderToStaticMarkup(<DeviceClientOsLabel value="Web · Yandex · macOS" />);
    expect(html.match(/whitespace-nowrap/g)?.length).toBe(3);
    expect(html).toContain(">Web</span>");
    expect(html).toContain("> · Yandex</span>");
    expect(html).toContain("> · macOS</span>");
  });

  it("renders empty/unknown values without crashing", () => {
    expect(textOf("unknown")).toBe("unknown");
  });
});
