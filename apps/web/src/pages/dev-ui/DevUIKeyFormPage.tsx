import { useMemo, useState } from "react";

import { Button } from "@okkey/ui";
import type { KeyFormMode } from "@okkey/ui";

import { KeyFormEditor } from "../../components/key-form/KeyFormEditor";
import { createInitialKeyFormSections } from "../../components/key-form/createInitialKeyFormSections";

export default function DevUIKeyFormPage() {
  const [mode, setMode] = useState<KeyFormMode>("edit");
  const initialSections = useMemo(() => createInitialKeyFormSections(), []);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Key form</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Demo for vault item forms: primary white sections, additional gray sections, editable labels, arbitrary field
              actions, dropdown creation, and native drag/drop ordering in edit mode. Demo TOTP secret for pasting into other
              fields: JBSWY3DPEHPK3PXP.
            </p>
          </div>

          <div className="flex rounded-lg border border-border bg-card p-1">
            <Button type="button" variant={mode === "view" ? "secondary" : "ghost"} size="sm" onClick={() => setMode("view")}>
              View
            </Button>
            <Button type="button" variant={mode === "edit" ? "secondary" : "ghost"} size="sm" onClick={() => setMode("edit")}>
              Edit
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
          <KeyFormEditor
            mode={mode}
            initialSections={initialSections}
            addSectionLabel="Add section with field"
            addFieldLabel="Add field"
          />
        </div>
      </section>
    </div>
  );
}
