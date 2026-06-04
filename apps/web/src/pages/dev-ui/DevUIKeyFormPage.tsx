import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode, type SVGProps } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, KeyField, KeyForm, KeySection, cn, keyFieldTypeOptions, type KeyFieldTypeOption, type KeyFormMode } from "@okkey/ui";

type DemoSectionVariant = "primary" | "additional";

type DemoField = {
  id: string;
  type: string;
  label: string;
  value: ReactNode;
  editableLabel?: boolean;
  secret?: boolean;
};

type DemoSection = {
  id: string;
  variant: DemoSectionVariant;
  title?: string;
  fields: DemoField[];
};

const englishKeyFieldTypeOptions: readonly KeyFieldTypeOption[] = keyFieldTypeOptions.map((type) => {
  const labels: Record<string, string> = {
    text: "Text",
    password: "Password",
    username: "Username",
    email: "Email",
    url: "Website URL",
    totp: "One-time password (TOTP)",
    note: "Note",
    phone: "Phone",
    "card-number": "Card number",
    "card-expiry": "Card expiry",
    date: "Date",
    file: "File",
    "ssh-key": "SSH key",
    "api-key": "API key",
    "recovery-code": "Recovery code",
    custom: "Custom field",
  };

  return {
    ...type,
    label: labels[type.id] ?? type.label,
  };
});

type SortableItemData =
  | {
      type: "field";
      sectionId: string;
    }
  | {
      type: "section";
    };

type ActiveDrag =
  | {
      type: "field";
      sectionId: string;
      fieldId: string;
      width?: number;
    }
  | {
      type: "section";
      sectionId: string;
      width?: number;
    };

function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function ActionButton({
  label,
  children,
  destructive = false,
  onClick,
}: {
  label: string;
  children: ReactNode;
  destructive?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="iconSm"
      className={destructive ? "size-6 min-h-6 min-w-6 text-destructive hover:text-destructive" : "size-6 min-h-6 min-w-6 text-muted-foreground hover:text-foreground"}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function PieIndicator({
  value,
  total,
  tone = "success",
}: {
  value: number;
  total: number;
  tone?: "success" | "warning" | "danger";
}) {
  const safeTotal = Math.max(1, total);
  const filled = Math.min(Math.max(value, 0), safeTotal);
  const degrees = (filled / safeTotal) * 360;
  const colorByTone = {
    success: "#65a30d",
    warning: "#d97706",
    danger: "#dc2626",
  };

  return (
    <span
      className="size-3 rounded-full"
      style={{
        backgroundImage: `conic-gradient(from -90deg, ${colorByTone[tone]} 0deg ${degrees}deg, hsl(var(--border)) ${degrees}deg 360deg)`,
      }}
      aria-hidden
    />
  );
}

function KeyCounter({
  children,
  sectionVariant,
  value,
  total,
  tone = "success",
}: {
  children: ReactNode;
  sectionVariant: DemoSectionVariant;
  value: number;
  total: number;
  tone?: "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 pr-1 text-xs leading-5 text-foreground",
        sectionVariant === "additional" ? "bg-card" : "bg-secondary",
      )}
    >
      {children}
      <PieIndicator value={value} total={total} tone={tone} />
    </span>
  );
}

function fieldValueForType(type: KeyFieldTypeOption): ReactNode {
  switch (type.id) {
    case "password":
    case "api-key":
    case "recovery-code":
    case "ssh-key":
      return "••••••••••";
    case "url":
      return "https://example.com";
    case "email":
      return "user@example.com";
    case "username":
      return "okkey-user";
    case "totp":
      return (
        <span className="font-mono text-[15px]">
          873 <span className="text-muted-foreground">•</span> 846
        </span>
      );
    case "phone":
      return "+7 999 000-00-00";
    case "card-number":
      return "4242 4242 4242 4242";
    case "card-expiry":
      return "12/30";
    case "date":
      return "02.05.2026";
    case "file":
      return "contract.pdf";
    case "note":
      return "Internal note for this item.";
    default:
      return "New value";
  }
}

function metaForField(type: string, sectionVariant: DemoSectionVariant): ReactNode {
  if (type === "password") {
    return (
      <KeyCounter sectionVariant={sectionVariant} value={8} total={10} tone="success">
        Good
      </KeyCounter>
    );
  }
  if (type === "totp") {
    return (
      <KeyCounter sectionVariant={sectionVariant} value={21} total={60} tone="success">
        21
      </KeyCounter>
    );
  }
  if (type === "recovery-code") {
    return (
      <KeyCounter sectionVariant={sectionVariant} value={2} total={10} tone="warning">
        2 of 10
      </KeyCounter>
    );
  }
  return null;
}

function createInitialSections(): DemoSection[] {
  return [
    {
      id: "credentials",
      variant: "primary",
      fields: [
        { id: "login", type: "username", label: "login", value: "shadcn@vercel.com" },
        { id: "password", type: "password", label: "password", value: "••••••••••", secret: true },
        {
          id: "totp",
          type: "totp",
          label: "one-time password (totp)",
          value: (
            <span className="font-mono text-[15px]">
              873 <span className="text-muted-foreground">•</span> 846
            </span>
          ),
        },
      ],
    },
    {
      id: "websites",
      variant: "primary",
      fields: [
        { id: "website-ru", type: "url", label: "website URL", value: "https://yandex.ru", editableLabel: true },
        { id: "website-com", type: "url", label: "international website URL", value: "https://yandex.com", editableLabel: true },
      ],
    },
    {
      id: "api-keys",
      variant: "additional",
      title: "API keys",
      fields: [
        {
          id: "recovery-codes",
          type: "recovery-code",
          label: "recovery codes",
          value: "••••••••••",
          editableLabel: true,
          secret: true,
        },
      ],
    },
  ];
}

type SortableFieldProps = {
  section: DemoSection;
  field: DemoField;
  mode: KeyFormMode;
  onLabelChange: (label: string) => void;
  onValueChange: (value: string) => void;
  actions: ReactNode;
};

function SortableField({ section, field, mode, onLabelChange, onValueChange, actions }: SortableFieldProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: {
      type: "field",
      sectionId: section.id,
    } satisfies SortableItemData,
    disabled: mode !== "edit",
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <KeyField
      ref={setNodeRef}
      label={field.label}
      value={field.value}
      mode={mode}
      editableLabel={field.editableLabel}
      editableValue={typeof field.value === "string"}
      reorderable
      meta={field.type === "password" ? null : metaForField(field.type, section.variant)}
      actions={actions}
      className={cn(isDragging && "relative z-10 opacity-0")}
      style={style}
      valueClassName={field.type === "note" ? "whitespace-normal" : undefined}
      onLabelChange={onLabelChange}
      onValueChange={onValueChange}
      dragHandleProps={mode === "edit" ? { ...attributes, ...listeners } : undefined}
    />
  );
}

type SortableSectionProps = {
  section: DemoSection;
  mode: KeyFormMode;
  fieldTypes: readonly KeyFieldTypeOption[];
  addFieldLabel: string;
  onAddField?: (type: KeyFieldTypeOption) => void;
  onTitleChange: (title: string) => void;
  children: ReactNode;
};

function SortableSection({
  section,
  mode,
  fieldTypes,
  addFieldLabel,
  onAddField,
  onTitleChange,
  children,
}: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    data: {
      type: "section",
    } satisfies SortableItemData,
    disabled: mode !== "edit" || section.variant !== "additional",
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <KeySection
      ref={setNodeRef}
      title={section.title}
      variant={section.variant}
      mode={mode}
      editableTitle
      reorderable
      fieldTypes={fieldTypes}
      addFieldLabel={addFieldLabel}
      className={cn(isDragging && "relative z-10 opacity-0")}
      style={style}
      onAddField={onAddField}
      onTitleChange={onTitleChange}
      dragHandleProps={mode === "edit" && section.variant === "additional" ? { ...attributes, ...listeners } : undefined}
    >
      {children}
    </KeySection>
  );
}

export default function DevUIKeyFormPage() {
  const [mode, setMode] = useState<KeyFormMode>("edit");
  const [sections, setSections] = useState<DemoSection[]>(() => createInitialSections());
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const nextIdRef = useRef(1);
  const fieldTypes = useMemo(() => englishKeyFieldTypeOptions, []);
  const urlFieldTypes = useMemo(() => englishKeyFieldTypeOptions.filter((type) => type.id === "url"), []);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const activeData = args.active.data.current as SortableItemData | undefined;
    const droppableContainers = args.droppableContainers.filter((container) => {
      const containerData = container.data.current as SortableItemData | undefined;
      if (activeData?.type === "field") {
        return containerData?.type === "field" && containerData.sectionId === activeData.sectionId;
      }
      if (activeData?.type === "section") {
        return containerData?.type === "section";
      }
      return true;
    });

    return closestCenter({
      ...args,
      droppableContainers,
    });
  }, []);

  function createField(type: KeyFieldTypeOption): DemoField {
    const id = `field-${nextIdRef.current++}`;
    return {
      id,
      type: type.id,
      label: type.label.toLowerCase(),
      value: fieldValueForType(type),
      editableLabel: true,
      secret: ["password", "api-key", "recovery-code", "ssh-key"].includes(type.id),
    };
  }

  function addSection(type: KeyFieldTypeOption) {
    const sectionId = `section-${nextIdRef.current++}`;
    setSections((current) => [
      ...current,
      {
        id: sectionId,
        variant: "additional",
        title: type.label,
        fields: [createField(type)],
      },
    ]);
  }

  function addField(sectionId: string, type: KeyFieldTypeOption) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, fields: [...section.fields, createField(type)] } : section,
      ),
    );
  }

  function updateSectionTitle(sectionId: string, title: string) {
    setSections((current) => current.map((section) => (section.id === sectionId ? { ...section, title } : section)));
  }

  function updateFieldLabel(sectionId: string, fieldId: string, label: string) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? { ...section, fields: section.fields.map((field) => (field.id === fieldId ? { ...field, label } : field)) }
          : section,
      ),
    );
  }

  function updateFieldValue(sectionId: string, fieldId: string, value: string) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? { ...section, fields: section.fields.map((field) => (field.id === fieldId ? { ...field, value } : field)) }
          : section,
      ),
    );
  }

  function removeField(sectionId: string, fieldId: string) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, fields: section.fields.filter((field) => field.id !== fieldId) } : section,
      ),
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    const activeData = event.active.data.current as SortableItemData | undefined;
    const width = event.active.rect.current.initial?.width;
    if (activeData?.type === "field") {
      setActiveDrag({ type: "field", sectionId: activeData.sectionId, fieldId: activeId, width });
      return;
    }
    if (activeData?.type === "section") {
      setActiveDrag({ type: "section", sectionId: activeId, width });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over || active.id === over.id) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    setSections((current) => {
      const activeSectionIndex = current.findIndex((section) => section.id === activeId && section.variant === "additional");
      const overSectionIndex = current.findIndex((section) => section.id === overId && section.variant === "additional");
      if (activeSectionIndex >= 0 && overSectionIndex >= 0) {
        return arrayMove(current, activeSectionIndex, overSectionIndex);
      }

      const activeFieldSectionIndex = current.findIndex((section) => section.fields.some((field) => field.id === activeId));
      const overFieldSectionIndex = current.findIndex((section) => section.fields.some((field) => field.id === overId));
      if (activeFieldSectionIndex < 0 || activeFieldSectionIndex !== overFieldSectionIndex) {
        return current;
      }

      const section = current[activeFieldSectionIndex];
      const activeFieldIndex = section.fields.findIndex((field) => field.id === activeId);
      const overFieldIndex = section.fields.findIndex((field) => field.id === overId);
      if (activeFieldIndex < 0 || overFieldIndex < 0) {
        return current;
      }

      const next = [...current];
      next[activeFieldSectionIndex] = {
        ...section,
        fields: arrayMove(section.fields, activeFieldIndex, overFieldIndex),
      };
      return next;
    });
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  function renderActions(section: DemoSection, field: DemoField) {
    const canEdit = mode === "edit";
    return (
      <>
        {field.type === "password" ? metaForField(field.type, section.variant) : null}
        {field.secret || field.type === "totp" ? (
          <ActionButton label="Show value">
            <EyeIcon className="size-4" />
          </ActionButton>
        ) : null}
        {canEdit && field.type === "url" ? (
          <ActionButton label="Field settings">
            <SettingsIcon className="size-4" />
          </ActionButton>
        ) : null}
        {canEdit ? (
          <ActionButton label="Delete field" destructive onClick={() => removeField(section.id, field.id)}>
            <TrashIcon className="size-4" />
          </ActionButton>
        ) : null}
      </>
    );
  }

  function renderField(section: DemoSection, field: DemoField) {
    return (
      <SortableField
        key={field.id}
        section={section}
        field={field}
        mode={mode}
        actions={renderActions(section, field)}
        onLabelChange={(label) => updateFieldLabel(section.id, field.id, label)}
        onValueChange={(value) => updateFieldValue(section.id, field.id, value)}
      />
    );
  }

  function renderFieldPreview(section: DemoSection, field: DemoField, isDraggedField = false) {
    return (
      <KeyField
        label={field.label}
        value={field.value}
        mode={mode}
        editableLabel={field.editableLabel}
        editableValue={typeof field.value === "string"}
        reorderable
        meta={field.type === "password" ? null : metaForField(field.type, section.variant)}
        actions={renderActions(section, field)}
        className={
          isDraggedField
            ? cn("rounded-lg border border-border shadow-lg", section.variant === "additional" ? "bg-secondary" : "bg-card")
            : undefined
        }
        style={isDraggedField && activeDrag?.type === "field" && activeDrag.width ? { width: activeDrag.width } : undefined}
        valueClassName={field.type === "note" ? "whitespace-normal" : undefined}
      />
    );
  }

  function renderDragOverlay() {
    if (activeDrag?.type === "field") {
      const section = sections.find((item) => item.id === activeDrag.sectionId);
      const field = section?.fields.find((item) => item.id === activeDrag.fieldId);
      return section && field ? renderFieldPreview(section, field, true) : null;
    }

    if (activeDrag?.type === "section") {
      const section = sections.find((item) => item.id === activeDrag.sectionId);
      if (!section) {
        return null;
      }

      return (
        <KeySection
          title={section.title}
          variant={section.variant}
          mode={mode}
          editableTitle
          reorderable
          fieldTypes={fieldTypes}
          onAddField={() => undefined}
          className="rounded-xl shadow-lg"
          style={activeDrag.width ? { width: activeDrag.width } : undefined}
        >
          {section.fields.map((field) => renderFieldPreview(section, field))}
        </KeySection>
      );
    }

    return null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Key form</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Demo for vault item forms: primary white sections, additional gray sections, editable labels, arbitrary field
              actions, dropdown creation, and native drag/drop ordering in edit mode.
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
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <KeyForm mode={mode} addSectionLabel="Add section with field" fieldTypes={fieldTypes} onAddSection={addSection}>
              <SortableContext
                items={sections.filter((section) => section.variant === "additional").map((section) => section.id)}
                strategy={verticalListSortingStrategy}
              >
                {sections.map((section) => {
                  const addableFieldTypes = section.id === "websites" ? urlFieldTypes : fieldTypes;
                  const fields = (
                    <SortableContext items={section.fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
                      {section.fields.map((field) => renderField(section, field))}
                    </SortableContext>
                  );

                  if (section.variant === "additional") {
                    return (
                      <SortableSection
                        key={section.id}
                        section={section}
                        mode={mode}
                        fieldTypes={addableFieldTypes}
                        addFieldLabel={section.id === "websites" ? "Add URL" : "Add field"}
                        onAddField={(type) => addField(section.id, type)}
                        onTitleChange={(title) => updateSectionTitle(section.id, title)}
                      >
                        {fields}
                      </SortableSection>
                    );
                  }

                  return (
                    <KeySection
                      key={section.id}
                      title={section.title}
                      variant={section.variant}
                      mode={mode}
                      editableTitle
                      reorderable
                      fieldTypes={addableFieldTypes}
                      addFieldLabel={section.id === "websites" ? "Add URL" : "Add field"}
                      onAddField={section.id === "websites" ? (type) => addField(section.id, type) : undefined}
                      onTitleChange={(title) => updateSectionTitle(section.id, title)}
                    >
                      {fields}
                    </KeySection>
                  );
                })}
              </SortableContext>
            </KeyForm>
            <DragOverlay>{renderDragOverlay()}</DragOverlay>
          </DndContext>
        </div>
      </section>
    </div>
  );
}
