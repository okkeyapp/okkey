import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

/**
 * demoqa.com/register fixture:
 * - Register CTA is type=button#register (no form submit)
 * - password autocomplete=off (not new-password)
 * - “Back to Login” sibling must not count as auth submit
 * - Page JS may clear/mutate fields after click — capture must happen in capture phase
 */
async function loadWithDemoqaDom(): Promise<{
  document: Document;
  form: HTMLFormElement;
  registerBtn: HTMLButtonElement;
  gotoLoginBtn: HTMLButtonElement;
  isAuthCredentialSubmitControl: (el: Element) => boolean;
  detectFormTypeForRoot: (
    root: ParentNode,
    doc: Document,
    options?: { urlPath?: string; formEl?: Element | null },
  ) => string;
  captureLoginCredentials: (
    root: ParentNode,
  ) => { username: string; password: string } | null;
}> {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>
      <form id="userForm" class="">
        <div style="margin-bottom: 50px;"><h4>Register to Book Store</h4></div>
        <input id="firstname" type="text" placeholder="First Name" />
        <input id="lastname" type="text" placeholder="Last Name" />
        <input id="userName" type="text" placeholder="UserName" />
        <input id="password" type="password" autocomplete="off"
          pattern="(?=^.{8,}$)((?=.*\\d)|(?=.*\\W+))(?![.\\n])(?=.*[A-Z])(?=.*[a-z]).*$" />
        <button type="button" id="register" class="btn btn-primary">Register</button>
        <button type="button" id="gotologin">Back to Login</button>
      </form>
    </body></html>`,
    { url: "https://demoqa.com/register" },
  );
  const { window } = dom;
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLFormElement: window.HTMLFormElement,
    Element: window.Element,
    Node: window.Node,
  });
  // jsdom inputs have empty client rects — mirror a laid-out field for visibility checks.
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

  // Cache-bust so instanceof HTMLInputElement sees the jsdom realm.
  const stamp = Date.now();
  const { isAuthCredentialSubmitControl, detectFormTypeForRoot } = await import(
    `./autofillFormDetect.ts?demoqa=${stamp}`
  );
  const { captureLoginCredentials } = await import(`./loginFormFields.ts?demoqa=${stamp}`);

  const document = window.document;
  const form = document.querySelector("#userForm");
  const registerBtn = document.querySelector("#register");
  const gotoLoginBtn = document.querySelector("#gotologin");
  assert.ok(form instanceof window.HTMLFormElement);
  assert.ok(registerBtn instanceof window.HTMLButtonElement);
  assert.ok(gotoLoginBtn instanceof window.HTMLButtonElement);
  return {
    document,
    form,
    registerBtn,
    gotoLoginBtn,
    isAuthCredentialSubmitControl,
    detectFormTypeForRoot,
    captureLoginCredentials,
  };
}

describe("demoqa register save-offer fixture", () => {
  it("treats #register type=button as auth submit; ignores Back to Login", async () => {
    const { registerBtn, gotoLoginBtn, isAuthCredentialSubmitControl } = await loadWithDemoqaDom();
    assert.equal(isAuthCredentialSubmitControl(registerBtn), true);
    assert.equal(isAuthCredentialSubmitControl(gotoLoginBtn), false);
  });

  it("detects form type register (heading + identity + /register, autocomplete=off)", async () => {
    const { document, form, detectFormTypeForRoot } = await loadWithDemoqaDom();
    assert.equal(
      detectFormTypeForRoot(form, document, { urlPath: "/register", formEl: form }),
      "register",
    );
  });

  it("captures username+password before a simulated page handler clears the form", async () => {
    const { document, form, registerBtn, isAuthCredentialSubmitControl, captureLoginCredentials } =
      await loadWithDemoqaDom();
    const userName = document.querySelector("#userName");
    const password = document.querySelector("#password");
    assert.ok(userName instanceof HTMLInputElement);
    assert.ok(password instanceof HTMLInputElement);
    userName.value = "sasha_demo";
    password.value = "TestPass1!";

    // Capture-phase snapshot (extension click listener, capture: true).
    assert.equal(isAuthCredentialSubmitControl(registerBtn), true);
    const snap = captureLoginCredentials(form);
    assert.deepEqual(snap, { username: "sasha_demo", password: "TestPass1!" });

    // Target-phase page handler (demoqa AJAX / captcha fail) clears fields.
    userName.value = "";
    password.value = "";
    assert.equal(captureLoginCredentials(form), null);

    // Offer must use the capture-phase snapshot, not a post-handler re-read.
    assert.deepEqual(snap, { username: "sasha_demo", password: "TestPass1!" });
  });
});
