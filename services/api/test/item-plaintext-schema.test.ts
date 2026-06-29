import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import {
  ITEM_CATEGORY_CREDIT_CARD,
  ITEM_CATEGORY_LOGIN,
  ITEM_CATEGORY_SECURE_NOTE,
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  createPresetItemPlaintextV2,
  migrateItemPlaintextV1ToV2,
  parseAndNormalizeItemPlaintextUtf8,
  validateItemPlaintextV2,
} from "../../../packages/types/dist/index.js";
import { replayItemPlaintextEvents } from "../../../packages/sync/dist/index.js";
import type { SyncEventWireDto } from "../../../packages/types/dist/index.js";

test("v1 → v2 migration maps title to secure_note preset", () => {
  const v2 = migrateItemPlaintextV1ToV2({
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    itemId: testEntityId(),
    vaultId: testEntityId(),
    title: "Hello",
    createdAtMs: 10,
    updatedAtMs: 20,
  });
  assert.equal(v2.schemaVersion, ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST);
  assert.equal(v2.categoryId, ITEM_CATEGORY_SECURE_NOTE);
  assert.equal(v2.title, "Hello");
  assert.equal(v2.updatedAtMs, 20);
  const noteField = v2.fields.find((f) => f.id === "f-note-body");
  assert.ok(noteField);
  assert.equal(noteField?.value.kind, "note");
  if (noteField?.value.kind === "note") {
    assert.equal(noteField.value.note, "");
  }
});

test("preset factories: login, secure_note, credit_card round-trip JSON", () => {
  const vaultId = testEntityId();
  const now = 1_700_000_000_000;
  for (const cat of [
    ITEM_CATEGORY_LOGIN,
    ITEM_CATEGORY_SECURE_NOTE,
    ITEM_CATEGORY_CREDIT_CARD,
  ] as const) {
    const item = createPresetItemPlaintextV2({
      categoryId: cat,
      itemId: testEntityId(),
      vaultId,
      title: `t-${cat}`,
      nowMs: now,
    });
    const bytes = new TextEncoder().encode(JSON.stringify(item));
    const back = parseAndNormalizeItemPlaintextUtf8(bytes);
    assert.ok(back);
    assert.equal(back?.categoryId, cat);
    assert.equal(back?.title, `t-${cat}`);
    const v = validateItemPlaintextV2(back!);
    assert.equal(v.ok, true, v.issues.map((i) => i.message).join("; "));
  }
});

test("unknown field type is preserved as unknown value bucket", () => {
  const raw = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    itemId: testEntityId(),
    vaultId: testEntityId(),
    title: "x",
    categoryId: ITEM_CATEGORY_LOGIN,
    createdAtMs: 1,
    updatedAtMs: 2,
    sections: [{ id: "s1", title: "S", order: 0, isPreset: true }],
    fields: [
      {
        id: "f1",
        type: "future_type",
        sectionId: "s1",
        order: 0,
        value: { kind: "unknown", declaredType: "future_type", raw: { a: 1 } },
      },
    ],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  const back = parseAndNormalizeItemPlaintextUtf8(bytes);
  assert.ok(back);
  const f = back?.fields[0];
  assert.equal(f?.type, "future_type");
  assert.equal(f?.value.kind, "unknown");
});

test("replay accepts v1 and v2 wire schema versions", async () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const v1 = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    itemId,
    vaultId,
    title: "Legacy",
    createdAtMs: 1,
    updatedAtMs: 2,
  };
  const v2 = createPresetItemPlaintextV2({
    categoryId: ITEM_CATEGORY_LOGIN,
    itemId: testEntityId(),
    vaultId,
    title: "New",
  });
  const events: SyncEventWireDto[] = [
    {
      id: testEntityId(),
      vaultId,
      actorId: null,
      eventType: "ITEM_CREATE",
      encryptedPayload: Buffer.from(JSON.stringify(v1), "utf8").toString("base64"),
      payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
      idempotencyKey: testEntityId(),
      clientCreatedAt: null,
      version: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: testEntityId(),
      vaultId,
      actorId: null,
      eventType: "ITEM_CREATE",
      encryptedPayload: Buffer.from(JSON.stringify(v2), "utf8").toString("base64"),
      payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
      idempotencyKey: testEntityId(),
      clientCreatedAt: null,
      version: 2,
      createdAt: new Date().toISOString(),
    },
  ];
  const state = await replayItemPlaintextEvents(events, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(state.items.get(itemId)?.title, "Legacy");
  assert.equal(state.items.get(v2.itemId)?.title, "New");
});

test("replay ITEM_UPDATE applies reordered sections and fields (sync via ITEM_UPDATE)", async () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const base = createPresetItemPlaintextV2({
    categoryId: ITEM_CATEGORY_LOGIN,
    itemId,
    vaultId,
    title: "Acct",
    nowMs: 100,
  });
  const withExtra: typeof base = {
    ...base,
    sections: [
      ...base.sections,
      { id: "s-custom-a", title: "Notes", order: 1 },
      { id: "s-custom-b", title: "Extra", order: 2 },
    ],
    fields: [
      ...base.fields,
      {
        id: "f-extra-1",
        type: "text",
        sectionId: "s-custom-b",
        order: 0,
        value: { kind: "text", text: "first" },
      },
      {
        id: "f-extra-2",
        type: "text",
        sectionId: "s-custom-b",
        order: 1,
        value: { kind: "text", text: "second" },
      },
    ],
  };

  const reordered: typeof withExtra = {
    ...withExtra,
    updatedAtMs: 200,
    sections: withExtra.sections.map((s) => {
      if (s.id === "s-custom-a") return { ...s, order: 2 };
      if (s.id === "s-custom-b") return { ...s, order: 1 };
      return s;
    }),
    fields: withExtra.fields.map((f) => {
      if (f.id === "f-extra-1") return { ...f, order: 1 };
      if (f.id === "f-extra-2") return { ...f, order: 0 };
      return f;
    }),
  };

  const events: SyncEventWireDto[] = [
    {
      id: testEntityId(),
      vaultId,
      actorId: null,
      eventType: "ITEM_CREATE",
      encryptedPayload: Buffer.from(JSON.stringify(withExtra), "utf8").toString("base64"),
      payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
      idempotencyKey: testEntityId(),
      clientCreatedAt: null,
      version: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: testEntityId(),
      vaultId,
      actorId: null,
      eventType: "ITEM_UPDATE",
      encryptedPayload: Buffer.from(JSON.stringify(reordered), "utf8").toString("base64"),
      payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
      idempotencyKey: null,
      clientCreatedAt: null,
      version: 2,
      createdAt: new Date().toISOString(),
    },
  ];

  const state = await replayItemPlaintextEvents(events, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  const final = state.items.get(itemId);
  assert.ok(final);
  assert.equal(final.sections.find((s) => s.id === "s-custom-a")?.order, 2);
  assert.equal(final.sections.find((s) => s.id === "s-custom-b")?.order, 1);
  assert.equal(final.fields.find((f) => f.id === "f-extra-1")?.order, 1);
  assert.equal(final.fields.find((f) => f.id === "f-extra-2")?.order, 0);
});

test("normalizeItemPlaintextV2 preserves archived flag", () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const item = createPresetItemPlaintextV2({
    categoryId: ITEM_CATEGORY_LOGIN,
    itemId,
    vaultId,
    title: "Archived login",
    nowMs: Date.now(),
  });
  const archived = { ...item, archived: true };
  const bytes = new TextEncoder().encode(JSON.stringify(archived));
  const parsed = parseAndNormalizeItemPlaintextUtf8(bytes);
  assert.ok(parsed);
  assert.equal(parsed.archived, true);
});
