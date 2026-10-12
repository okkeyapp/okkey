import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCKING_OVERLAY_UI_SELECTOR,
  activeElementIsBlockingOverlayUi,
  pageHasBlockingOverlayUi,
  shouldFreezeOverlayUpdates,
} from "./pageBlockingOverlayUi.ts";

function rootWithMatch(match: boolean): ParentNode {
  return {
    querySelector(selector: string) {
      assert.equal(selector, BLOCKING_OVERLAY_UI_SELECTOR);
      return match ? ({} as Element) : null;
    },
  } as ParentNode;
}

test("BLOCKING_OVERLAY_UI_SELECTOR covers Select viewport and datepicker panel", () => {
  assert.ok(BLOCKING_OVERLAY_UI_SELECTOR.includes("[data-radix-select-viewport]"));
  assert.ok(BLOCKING_OVERLAY_UI_SELECTOR.includes("[data-key-field-date-picker-panel]"));
  assert.ok(BLOCKING_OVERLAY_UI_SELECTOR.includes('[data-slot="popover-content"]'));
  assert.ok(BLOCKING_OVERLAY_UI_SELECTOR.includes('[role="listbox"][data-state="open"]'));
  assert.ok(BLOCKING_OVERLAY_UI_SELECTOR.includes('[role="combobox"][aria-expanded="true"]'));
  assert.ok(BLOCKING_OVERLAY_UI_SELECTOR.includes('button[data-state="open"][aria-haspopup="listbox"]'));
});

test("BLOCKING_OVERLAY_UI_SELECTOR does not treat generic dialogs as blocking", () => {
  assert.equal(BLOCKING_OVERLAY_UI_SELECTOR.includes('[role="dialog"]'), false);
});

test("pageHasBlockingOverlayUi is false when querySelector finds nothing", () => {
  assert.equal(pageHasBlockingOverlayUi(rootWithMatch(false)), false);
});

test("pageHasBlockingOverlayUi is true when an open dropdown matches", () => {
  assert.equal(pageHasBlockingOverlayUi(rootWithMatch(true)), true);
});

test("pageHasBlockingOverlayUi swallows querySelector errors", () => {
  const root = {
    querySelector() {
      throw new Error("boom");
    },
  } as unknown as ParentNode;
  assert.equal(pageHasBlockingOverlayUi(root), false);
});

test("shouldFreezeOverlayUpdates follows pageHasBlockingOverlayUi for custom roots", () => {
  assert.equal(shouldFreezeOverlayUpdates(rootWithMatch(true)), true);
  assert.equal(shouldFreezeOverlayUpdates(rootWithMatch(false)), false);
});

test("activeElementIsBlockingOverlayUi is false for null", () => {
  assert.equal(activeElementIsBlockingOverlayUi(null), false);
});
