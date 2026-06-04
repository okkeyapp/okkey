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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M1.33325 7.99992C1.33325 7.99992 3.33325 3.33325 7.99992 3.33325C12.6666 3.33325 14.6666 7.99992 14.6666 7.99992C14.6666 7.99992 12.6666 12.6666 7.99992 12.6666C3.33325 12.6666 1.33325 7.99992 1.33325 7.99992Z" stroke="#737373" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.99992 9.99992C9.10449 9.99992 9.99992 9.10449 9.99992 7.99992C9.99992 6.89535 9.10449 5.99992 7.99992 5.99992C6.89535 5.99992 5.99992 6.89535 5.99992 7.99992C5.99992 9.10449 6.89535 9.99992 7.99992 9.99992Z" stroke="#737373" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M2 3.99992H14M12.6667 3.99992V13.3333C12.6667 13.9999 12 14.6666 11.3333 14.6666H4.66667C4 14.6666 3.33333 13.9999 3.33333 13.3333V3.99992M5.33333 3.99992V2.66659C5.33333 1.99992 6 1.33325 6.66667 1.33325H9.33333C10 1.33325 10.6667 1.99992 10.6667 2.66659V3.99992M6.66667 7.33325V11.3333M9.33333 7.33325V11.3333" stroke="#EF4444" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M8.14667 1.33325H7.85333C7.49971 1.33325 7.16057 1.47373 6.91053 1.72378C6.66048 1.97382 6.52 2.31296 6.52 2.66659V2.78659C6.51976 3.0204 6.45804 3.25005 6.34103 3.45248C6.22401 3.65491 6.05583 3.82301 5.85333 3.93992L5.56667 4.10659C5.36398 4.22361 5.13405 4.28522 4.9 4.28522C4.66595 4.28522 4.43603 4.22361 4.23333 4.10659L4.13333 4.05325C3.82738 3.87676 3.46389 3.82888 3.12267 3.92012C2.78145 4.01137 2.49037 4.23428 2.31333 4.53992L2.16667 4.79325C1.99018 5.09921 1.9423 5.46269 2.03354 5.80392C2.12478 6.14514 2.34769 6.43622 2.65333 6.61325L2.75333 6.67992C2.95485 6.79626 3.12241 6.96331 3.23937 7.16447C3.35632 7.36563 3.4186 7.5939 3.42 7.82658V8.16658C3.42093 8.40153 3.35977 8.63255 3.2427 8.83626C3.12563 9.03996 2.95681 9.20911 2.75333 9.32658L2.65333 9.38658C2.34769 9.56362 2.12478 9.8547 2.03354 10.1959C1.9423 10.5371 1.99018 10.9006 2.16667 11.2066L2.31333 11.4599C2.49037 11.7656 2.78145 11.9885 3.12267 12.0797C3.46389 12.171 3.82738 12.1231 4.13333 11.9466L4.23333 11.8933C4.43603 11.7762 4.66595 11.7146 4.9 11.7146C5.13405 11.7146 5.36398 11.7762 5.56667 11.8933L5.85333 12.0599C6.05583 12.1768 6.22401 12.3449 6.34103 12.5474C6.45804 12.7498 6.51976 12.9794 6.52 13.2133V13.3333C6.52 13.6869 6.66048 14.026 6.91053 14.2761C7.16057 14.5261 7.49971 14.6666 7.85333 14.6666H8.14667C8.50029 14.6666 8.83943 14.5261 9.08948 14.2761C9.33953 14.026 9.48 13.6869 9.48 13.3333V13.2133C9.48024 12.9794 9.54196 12.7498 9.65898 12.5474C9.77599 12.3449 9.94418 12.1768 10.1467 12.0599L10.4333 11.8933C10.636 11.7762 10.866 11.7146 11.1 11.7146C11.3341 11.7146 11.564 11.7762 11.7667 11.8933L11.8667 11.9466C12.1726 12.1231 12.5361 12.171 12.8773 12.0797C13.2186 11.9885 13.5096 11.7656 13.6867 11.4599L13.8333 11.1999C14.0098 10.894 14.0577 10.5305 13.9665 10.1893C13.8752 9.84803 13.6523 9.55695 13.3467 9.37992L13.2467 9.32658C13.0432 9.20911 12.8744 9.03996 12.7573 8.83626C12.6402 8.63255 12.5791 8.40153 12.58 8.16658V7.83325C12.5791 7.5983 12.6402 7.36728 12.7573 7.16358C12.8744 6.95988 13.0432 6.79072 13.2467 6.67325L13.3467 6.61325C13.6523 6.43622 13.8752 6.14514 13.9665 5.80392C14.0577 5.46269 14.0098 5.09921 13.8333 4.79325L13.6867 4.53992C13.5096 4.23428 13.2186 4.01137 12.8773 3.92012C12.5361 3.82888 12.1726 3.87676 11.8667 4.05325L11.7667 4.10659C11.564 4.22361 11.3341 4.28522 11.1 4.28522C10.866 4.28522 10.636 4.22361 10.4333 4.10659L10.1467 3.93992C9.94418 3.82301 9.77599 3.65491 9.65898 3.45248C9.54196 3.25005 9.48024 3.0204 9.48 2.78659V2.66659C9.48 2.31296 9.33953 1.97382 9.08948 1.72378C8.83943 1.47373 8.50029 1.33325 8.14667 1.33325Z" stroke="#737373" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 9.99992C9.10457 9.99992 10 9.10449 10 7.99992C10 6.89535 9.10457 5.99992 8 5.99992C6.89543 5.99992 6 6.89535 6 7.99992C6 9.10449 6.89543 9.99992 8 9.99992Z" stroke="#737373" strokeLinecap="round" strokeLinejoin="round" />
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

function pointOnCircle(center: number, radius: number, angleDegrees: number) {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(angleRadians),
    y: center + radius * Math.sin(angleRadians),
  };
}

function pieSegmentPath(index: number, totalSegments: number) {
  const center = 8;
  const radius = 6;
  const segmentDegrees = 360 / totalSegments;
  const startAngle = -90 + index * segmentDegrees + 0.35;
  const endAngle = -90 + (index + 1) * segmentDegrees - 0.35;
  const start = pointOnCircle(center, radius, startAngle);
  const end = pointOnCircle(center, radius, endAngle);

  return `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y} Z`;
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
  const totalSegments = 60;
  const safeTotal = Math.max(1, total);
  const filled = Math.min(Math.max(value, 0), safeTotal);
  const filledSegments = Math.round((filled / safeTotal) * totalSegments);
  const colorByTone = {
    success: "#65A30D",
    warning: "#D97706",
    danger: "#DC2626",
  };
  const color = colorByTone[tone];

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" data-value={value} data-total={total} data-filled-segments={filledSegments} aria-hidden>
      {Array.from({ length: totalSegments }, (_, index) => (
        <path
          key={index}
          d={pieSegmentPath(index, totalSegments)}
          fill={index < filledSegments ? color : "hsl(var(--border))"}
        />
      ))}
      <path d="M2 8C2 8.78793 2.15519 9.56815 2.45672 10.2961C2.75825 11.0241 3.20021 11.6855 3.75736 12.2426C4.31451 12.7998 4.97595 13.2417 5.7039 13.5433C6.43185 13.8448 7.21207 14 8 14C8.78793 14 9.56815 13.8448 10.2961 13.5433C11.0241 13.2417 11.6855 12.7998 12.2426 12.2426C12.7998 11.6855 13.2417 11.0241 13.5433 10.2961C13.8448 9.56815 14 8.78793 14 8C14 6.4087 13.3679 4.88258 12.2426 3.75736C11.1174 2.63214 9.5913 2 8 2C6.4087 2 4.88258 2.63214 3.75736 3.75736C2.63214 4.88258 2 6.4087 2 8Z" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
      current
        .map((section) =>
          section.id === sectionId ? { ...section, fields: section.fields.filter((field) => field.id !== fieldId) } : section,
        )
        .filter((section) => section.fields.length > 0),
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
