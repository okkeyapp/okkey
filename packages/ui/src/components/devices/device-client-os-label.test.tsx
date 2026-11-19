import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DeviceClientOsLabel } from "./device-client-os-label.js";

function textOf(value: string): string {
  return renderToStaticMarkup(<DeviceClientOsLabel value={value} />).replace(/<[^>]+>/g, "");
}

describe("DeviceClientOsLabel", () => {
  it("keeps the readable subtitle text (NBSP before ·)", () => {
    const text = textOf("Web · Yandex · macOS");
    expect(text.replace(/\u00A0/g, " ")).toBe("Web · Yandex · macOS");
  });

  it("exposes the full value as title and truncates when constrained", () => {
    const html = renderToStaticMarkup(<DeviceClientOsLabel value="Web · Yandex · macOS" />);
    expect(html).toContain('title="Web · Yandex · macOS"');
    expect(html).toContain("truncate");
    expect(html).toContain('data-testid="pending-device-client-os"');
  });

  it("renders empty/unknown values without crashing", () => {
    expect(textOf("unknown")).toBe("unknown");
  });
});
