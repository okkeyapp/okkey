/**
 * Owned EN fixtures (not third-party HTML): classify + fill for loyalty / vehicle / travel.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

function installDomGlobals(window: Window & typeof globalThis): void {
  Object.assign(globalThis, {
    window,
    document: window.document,
    Document: window.Document,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    InputEvent: window.InputEvent,
    Event: window.Event,
  });
  window.HTMLElement.prototype.getClientRects = function getClientRects() {
    return {
      length: 1,
      0: {
        width: 120,
        height: 32,
        top: 0,
        left: 0,
        bottom: 32,
        right: 120,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      },
      item(i: number) {
        return i === 0 ? this[0] : null;
      },
      *[Symbol.iterator]() {
        yield this[0];
      },
    } as unknown as DOMRectList;
  };
}

async function loadFillModule(stamp: string) {
  return import(`./loginFormFields.ts?specialty=${stamp}`);
}

async function loadClassifyModule(stamp: string) {
  return import(`./autofillFieldClassify.ts?specialty=${stamp}`);
}

describe("specialty autofill fill mapping (loyalty / vehicle / travel)", () => {
  it("fills loyalty_card form fields and skips password / hidden", async () => {
    const stamp = String(Date.now());
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>
        <form id="loyalty">
          <label for="member">Membership number</label>
          <input id="member" name="memberNumber" type="text" />
          <label for="program">Loyalty program</label>
          <input id="program" name="loyaltyProgram" type="text" />
          <label for="barcode">Barcode</label>
          <input id="barcode" name="barcode" type="text" />
          <input id="secret" name="password" type="password" />
          <input id="hidden-member" name="memberNumberHidden" type="hidden" value="" />
        </form>
      </body></html>`,
      { url: "https://example.test/loyalty" },
    );
    const { window } = dom;
    installDomGlobals(window);

    const { fillAutofillValues } = await loadFillModule(stamp);
    const { classifyAutofillInput, collectInputHints } = await loadClassifyModule(stamp);

    assert.equal(
      classifyAutofillInput(collectInputHints(window.document.querySelector("#member")!)),
      "loyalty-card-number",
    );

    // Broker strips login keys for specialty categories before fill — simulate that map.
    const filled = fillAutofillValues(window.document, {
      "loyalty-card-number": "555001",
      "loyalty-provider": "Miles&Go",
      "loyalty-barcode": "BC-9",
    });
    assert.ok(filled >= 3);
    assert.equal((window.document.querySelector("#member") as HTMLInputElement).value, "555001");
    assert.equal((window.document.querySelector("#program") as HTMLInputElement).value, "Miles&Go");
    assert.equal((window.document.querySelector("#barcode") as HTMLInputElement).value, "BC-9");
    assert.equal((window.document.querySelector("#secret") as HTMLInputElement).value, "");
    assert.equal((window.document.querySelector("#hidden-member") as HTMLInputElement).value, "");
  });

  it("fills vehicle form fields from semantic map", async () => {
    const stamp = `${Date.now()}-vehicle`;
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>
        <form id="vehicle">
          <label for="plate">License plate</label>
          <input id="plate" name="licensePlate" type="text" />
          <label for="vin">VIN</label>
          <input id="vin" name="vin" type="text" />
          <label for="make">Make / model</label>
          <input id="make" name="makeModel" type="text" />
          <label for="policy">Insurance policy</label>
          <input id="policy" name="policyNumber" type="text" />
        </form>
      </body></html>`,
      { url: "https://example.test/vehicle" },
    );
    const { window } = dom;
    installDomGlobals(window);

    const { fillAutofillValues } = await loadFillModule(stamp);
    const filled = fillAutofillValues(window.document, {
      "vehicle-plate": "A123BC77",
      "vehicle-vin": "JTDBR32E720123456",
      "vehicle-make-model": "Toyota Camry",
      "vehicle-insurance-policy-number": "POL-1",
    });
    assert.ok(filled >= 4);
    assert.equal((window.document.querySelector("#plate") as HTMLInputElement).value, "A123BC77");
    assert.equal((window.document.querySelector("#vin") as HTMLInputElement).value, "JTDBR32E720123456");
    assert.equal((window.document.querySelector("#make") as HTMLInputElement).value, "Toyota Camry");
    assert.equal((window.document.querySelector("#policy") as HTMLInputElement).value, "POL-1");
  });

  it("fills travel_booking form fields from semantic map", async () => {
    const stamp = `${Date.now()}-travel`;
    const dom = new JSDOM(
      `<!DOCTYPE html><html><body>
        <form id="travel">
          <label for="pnr">Booking reference</label>
          <input id="pnr" name="pnr" type="text" />
          <label for="flight">Flight number</label>
          <input id="flight" name="flightNumber" type="text" />
          <label for="from">From</label>
          <input id="from" name="from" type="text" />
          <label for="to">To</label>
          <input id="to" name="to" type="text" />
          <label for="carrier">Carrier</label>
          <input id="carrier" name="carrier" type="text" />
        </form>
      </body></html>`,
      { url: "https://example.test/travel" },
    );
    const { window } = dom;
    installDomGlobals(window);

    const { fillAutofillValues } = await loadFillModule(stamp);
    const filled = fillAutofillValues(window.document, {
      "travel-booking-reference": "ABC123",
      "travel-trip-number": "SU100",
      "travel-from": "SVO",
      "travel-to": "LED",
      "travel-carrier": "Aeroflot",
    });
    assert.ok(filled >= 5);
    assert.equal((window.document.querySelector("#pnr") as HTMLInputElement).value, "ABC123");
    assert.equal((window.document.querySelector("#flight") as HTMLInputElement).value, "SU100");
    assert.equal((window.document.querySelector("#from") as HTMLInputElement).value, "SVO");
    assert.equal((window.document.querySelector("#to") as HTMLInputElement).value, "LED");
    assert.equal((window.document.querySelector("#carrier") as HTMLInputElement).value, "Aeroflot");
  });
});
