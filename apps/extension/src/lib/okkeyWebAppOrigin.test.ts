import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOkkeyWebAppOrigin } from "./okkeyWebAppOrigin.ts";

describe("isOkkeyWebAppOrigin", () => {
  it("matches production okkey.app hosts", () => {
    assert.equal(isOkkeyWebAppOrigin({ hostname: "okkey.app", port: "", protocol: "https:", origin: "https://okkey.app" }), true);
    assert.equal(
      isOkkeyWebAppOrigin({ hostname: "app.okkey.app", port: "", protocol: "https:", origin: "https://app.okkey.app" }),
      true,
    );
  });

  it("matches local Vite web ports", () => {
    assert.equal(
      isOkkeyWebAppOrigin({ hostname: "localhost", port: "5173", protocol: "http:", origin: "http://localhost:5173" }),
      true,
    );
    assert.equal(
      isOkkeyWebAppOrigin({ hostname: "127.0.0.1", port: "3000", protocol: "http:", origin: "http://127.0.0.1:3000" }),
      true,
    );
  });

  it("does not match unrelated sites", () => {
    assert.equal(
      isOkkeyWebAppOrigin({ hostname: "example.com", port: "", protocol: "https:", origin: "https://example.com" }),
      false,
    );
    assert.equal(
      isOkkeyWebAppOrigin({ hostname: "localhost", port: "8080", protocol: "http:", origin: "http://localhost:8080" }),
      false,
    );
  });
});
