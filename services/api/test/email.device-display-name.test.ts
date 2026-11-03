import test from "node:test";
import assert from "node:assert/strict";
import { resolveDeviceDetailName } from "@okkey/email-templates";


test("resolveDeviceDetailName collapses overlapping auto-names into platform · OS", () => {
  assert.equal(
    resolveDeviceDetailName("Web Chrome", "Web · Chrome", "macOS"),
    "Web · Chrome · macOS",
  );
  assert.equal(
    resolveDeviceDetailName("Mobile Android - App", "Mobile · App", "Android"),
    "Mobile · App · Android",
  );
});

test("resolveDeviceDetailName keeps custom device names with platform details", () => {
  assert.equal(
    resolveDeviceDetailName("Pixel", "Desktop · App", "macOS"),
    "Pixel · Desktop · App · macOS",
  );
});
