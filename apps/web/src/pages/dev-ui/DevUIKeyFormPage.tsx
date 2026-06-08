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
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  KeyField,
  KeyForm,
  KeySection,
  cn,
  keyFieldTypeOptions,
  type KeyFieldTypeOption,
  type KeyFormMode,
} from "@okkey/ui";

type DemoSectionVariant = "primary" | "additional";

type DemoField = {
  id: string;
  type: string;
  label: string;
  value: ReactNode;
  copyValue?: string;
  editableLabel?: boolean;
  secret?: boolean;
};

type DemoSection = {
  id: string;
  variant: DemoSectionVariant;
  title?: string;
  fields: DemoField[];
};

const englishKeyFieldTypeOptions = keyFieldTypeOptions;

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
      <path d="M7.99992 8.66675C8.36811 8.66675 8.66659 8.36827 8.66659 8.00008C8.66659 7.63189 8.36811 7.33341 7.99992 7.33341C7.63173 7.33341 7.33325 7.63189 7.33325 8.00008C7.33325 8.36827 7.63173 8.66675 7.99992 8.66675Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.99992 4.00008C8.36811 4.00008 8.66659 3.7016 8.66659 3.33341C8.66659 2.96522 8.36811 2.66675 7.99992 2.66675C7.63173 2.66675 7.33325 2.96522 7.33325 3.33341C7.33325 3.7016 7.63173 4.00008 7.99992 4.00008Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.99992 13.3334C8.36811 13.3334 8.66659 13.0349 8.66659 12.6667C8.66659 12.2986 8.36811 12.0001 7.99992 12.0001C7.63173 12.0001 7.33325 12.2986 7.33325 12.6667C7.33325 13.0349 7.63173 13.3334 7.99992 13.3334Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M4.66602 6.44499C4.66602 5.97344 4.85334 5.5212 5.18678 5.18776C5.52022 4.85432 5.97246 4.66699 6.44402 4.66699H12.2213C12.4548 4.66699 12.686 4.71298 12.9018 4.80233C13.1175 4.89169 13.3135 5.02265 13.4786 5.18776C13.6437 5.35286 13.7747 5.54886 13.864 5.76458C13.9534 5.9803 13.9993 6.2115 13.9993 6.44499V12.2223C13.9993 12.4558 13.9534 12.687 13.864 12.9027C13.7747 13.1185 13.6437 13.3145 13.4786 13.4796C13.3135 13.6447 13.1175 13.7756 12.9018 13.865C12.686 13.9543 12.4548 14.0003 12.2213 14.0003H6.44402C6.21053 14.0003 5.97932 13.9543 5.7636 13.865C5.54789 13.7756 5.35188 13.6447 5.18678 13.4796C5.02168 13.3145 4.89071 13.1185 4.80136 12.9027C4.71201 12.687 4.66602 12.4558 4.66602 12.2223V6.44499Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.67467 11.158C2.47023 11.0415 2.30018 10.873 2.18172 10.6697C2.06325 10.4663 2.00057 10.2353 2 10V3.33333C2 2.6 2.6 2 3.33333 2H10C10.5 2 10.772 2.25667 11 2.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpenWebsiteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M14 6V2H10M14 2L6.66667 9.33333M12 8.66667V12.6667C12 13.0203 11.8595 13.3594 11.6095 13.6095C11.3594 13.8595 11.0203 14 10.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V5.33333C2 4.97971 2.14048 4.64057 2.39052 4.39052C2.64057 4.14048 2.97971 4 3.33333 4H7.33333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShowPasswordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M6.66602 8.00033C6.66602 8.35395 6.80649 8.69309 7.05654 8.94313C7.30659 9.19318 7.64573 9.33366 7.99935 9.33366C8.35297 9.33366 8.69211 9.19318 8.94216 8.94313C9.19221 8.69309 9.33268 8.35395 9.33268 8.00033C9.33268 7.6467 9.19221 7.30757 8.94216 7.05752C8.69211 6.80747 8.35297 6.66699 7.99935 6.66699C7.64573 6.66699 7.30659 6.80747 7.05654 7.05752C6.80649 7.30757 6.66602 7.6467 6.66602 8.00033Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 8C12.4 10.6667 10.4 12 8 12C5.6 12 3.6 10.6667 2 8C3.6 5.33333 5.6 4 8 4C10.4 4 12.4 5.33333 14 8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HidePasswordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M7.05638 7.05762C6.80637 7.30772 6.66595 7.64689 6.66602 8.00052C6.66608 8.35415 6.80662 8.69327 7.05672 8.94328C7.30682 9.19329 7.64599 9.33371 7.99962 9.33365C8.35325 9.33359 8.69237 9.19305 8.94238 8.94295" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.1207 11.1154C10.1855 11.7005 9.1031 12.0073 8 12C5.6 12 3.6 10.6667 2 8.00002C2.848 6.58669 3.808 5.54802 4.88 4.88402M6.78667 4.12002C7.18603 4.03917 7.59254 3.99897 8 4.00002C10.4 4.00002 12.4 5.33335 14 8.00002C13.556 8.74002 13.0807 9.37802 12.5747 9.91335" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 2L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActionButton({
  label,
  children,
  destructive = false,
  sectionVariant,
  onClick,
}: {
  label: string;
  children: ReactNode;
  destructive?: boolean;
  sectionVariant: DemoSectionVariant;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="iconSm"
      className={cn(
        destructive ? "size-6 min-h-6 min-w-6 text-destructive hover:text-destructive" : "size-6 min-h-6 min-w-6 text-muted-foreground hover:text-foreground",
        sectionVariant === "additional" && "hover:!bg-card",
      )}
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
  const totalSegments = 60;
  const safeTotal = Math.max(1, total);
  const filled = Math.min(Math.max(value, 0), safeTotal);
  const filledSegments = Math.round((filled / safeTotal) * totalSegments);
  const degrees = (filledSegments / totalSegments) * 360;
  const colorByTone = {
    success: "#65A30D",
    warning: "#D97706",
    danger: "#DC2626",
  };
  const color = colorByTone[tone];

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" data-value={value} data-total={total} data-filled-segments={filledSegments} aria-hidden>
      <foreignObject x="2" y="2" width="12" height="12">
        <div
          className="size-3 rounded-full"
          style={{
            backgroundImage: `conic-gradient(from 0deg, ${color} 0deg ${degrees}deg, hsl(var(--border)) ${degrees}deg 360deg)`,
          }}
        />
      </foreignObject>
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
    case "recovery-codes":
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
    case "address":
      return "221B Baker Street, London";
    case "card-number":
      return "4242 4242 4242 4242";
    case "card-expiry":
      return "12/30";
    case "date":
      return "02.05.2026";
    case "file":
      return "Attach a file";
    case "multiline-text":
    case "note":
      return "Internal note for this item.";
    default:
      return "New value";
  }
}

function copyValueForType(type: KeyFieldTypeOption): string {
  switch (type.id) {
    case "password":
      return "correct-horse-battery-staple";
    case "recovery-codes":
      return "2 remaining recovery codes";
    case "totp":
      return "873846";
    default: {
      const value = fieldValueForType(type);
      return typeof value === "string" ? value : "";
    }
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
  if (type === "recovery-codes") {
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
        { id: "login", type: "username", label: "login", value: "shadcn@vercel.com", copyValue: "shadcn@vercel.com" },
        { id: "password", type: "password", label: "password", value: "••••••••••", copyValue: "correct-horse-battery-staple", secret: true },
        {
          id: "totp",
          type: "totp",
          label: "one-time password (totp)",
          value: (
            <span className="font-mono text-[15px]">
              873 <span className="text-muted-foreground">•</span> 846
            </span>
          ),
          copyValue: "873846",
        },
      ],
    },
    {
      id: "websites",
      variant: "primary",
      fields: [
        { id: "website-ru", type: "url", label: "website URL", value: "https://yandex.ru", copyValue: "https://yandex.ru", editableLabel: true },
        { id: "website-com", type: "url", label: "international website URL", value: "https://yandex.com", copyValue: "https://yandex.com", editableLabel: true },
      ],
    },
    {
      id: "api-keys",
      variant: "additional",
      title: "API keys",
      fields: [
        {
          id: "recovery-codes",
          type: "recovery-codes",
          label: "recovery codes",
          value: "••••••••••",
          copyValue: "2 remaining recovery codes",
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
  value: ReactNode;
  mode: KeyFormMode;
  reorderable: boolean;
  onLabelChange: (label: string) => void;
  onValueChange: (value: string) => void;
  actions: ReactNode;
  floatingActions?: ReactNode;
  isHoverLocked?: boolean;
  copyLabel?: string;
  copySuccessLabel?: string | null;
  onCopyAction?: (value: string) => void | Promise<void>;
};

function SortableField({
  section,
  field,
  value,
  mode,
  reorderable,
  onLabelChange,
  onValueChange,
  actions,
  floatingActions,
  isHoverLocked,
  copyLabel,
  copySuccessLabel,
  onCopyAction,
}: SortableFieldProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: {
      type: "field",
      sectionId: section.id,
    } satisfies SortableItemData,
    disabled: mode !== "edit" || !reorderable,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <KeyField
      ref={setNodeRef}
      label={field.label}
      value={value}
      mode={mode}
      editableLabel={field.editableLabel}
      editableValue={typeof value === "string"}
      reorderable={reorderable}
      meta={field.type === "password" ? null : metaForField(field.type, section.variant)}
      actions={actions}
      floatingActions={floatingActions}
      isHoverLocked={isHoverLocked}
      className={cn(isDragging && "relative z-10 opacity-0")}
      style={style}
      valueClassName={field.type === "multiline-text" || field.type === "note" ? "whitespace-normal" : undefined}
      controlButtonClassName={section.variant === "additional" ? "hover:!bg-card" : undefined}
      copyValue={field.copyValue}
      copyLabel={copyLabel}
      copySuccessLabel={copySuccessLabel}
      copyIcon={field.type === "url" ? <OpenWebsiteIcon className="size-4" /> : undefined}
      copyIconPosition={field.type === "url" ? "end" : undefined}
      copyHoverClassName={
        section.variant === "additional"
          ? "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)]"
          : "hover:bg-secondary"
      }
      copyHoverActiveClassName={
        section.variant === "additional"
          ? "bg-[color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)]"
          : "bg-secondary"
      }
      copyOverlayClassName={
        section.variant === "additional"
          ? "bg-[color-mix(in_hsl,color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)_40%,transparent)]"
          : "bg-secondary/40"
      }
      copyTextClassName={
        section.variant === "additional"
          ? "bg-[color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)]"
          : "bg-secondary"
      }
      onCopyAction={onCopyAction}
      onLabelChange={onLabelChange}
      onValueChange={onValueChange}
      dragHandleProps={mode === "edit" && reorderable ? { ...attributes, ...listeners } : undefined}
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
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<ReadonlySet<string>>(() => new Set());
  const [openFieldMenuId, setOpenFieldMenuId] = useState<string | null>(null);
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
      copyValue: copyValueForType(type),
      editableLabel: true,
      secret: ["password", "recovery-codes"].includes(type.id),
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
          ? {
              ...section,
              fields: section.fields.map((field) =>
                field.id === fieldId
                  ? { ...field, value, copyValue: field.secret ? field.copyValue : value }
                  : field,
              ),
            }
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
    if (!canEdit) {
      return field.type === "password" ? (
        <span className={cn("transition-opacity group-hover/key-field:opacity-0", openFieldMenuId === field.id && "opacity-0")}>
          {metaForField(field.type, section.variant)}
        </span>
      ) : null;
    }

    return (
      <>
        {field.type === "password" ? metaForField(field.type, section.variant) : null}
        {field.secret || field.type === "totp" ? (
          <ActionButton label="Show value" sectionVariant={section.variant}>
            <EyeIcon className="size-4" />
          </ActionButton>
        ) : null}
        {canEdit && field.type === "url" ? (
          <ActionButton label="Field settings" sectionVariant={section.variant}>
            <SettingsIcon className="size-4" />
          </ActionButton>
        ) : null}
        {canEdit ? (
          <ActionButton label="Delete field" destructive sectionVariant={section.variant} onClick={() => removeField(section.id, field.id)}>
            <TrashIcon className="size-4" />
          </ActionButton>
        ) : null}
      </>
    );
  }

  function togglePasswordVisibility(fieldId: string) {
    setVisiblePasswordIds((current) => {
      const next = new Set(current);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  }

  function openWebsite(value: string) {
    const openedWindow = window.open(value, "_blank", "noopener,noreferrer");
    if (openedWindow) {
      openedWindow.opener = null;
    }
  }

  function valueForField(field: DemoField): ReactNode {
    if (field.type === "password" && visiblePasswordIds.has(field.id)) {
      return field.copyValue ?? field.value;
    }
    return field.value;
  }

  function renderFloatingActions(field: DemoField) {
    if (mode !== "view" || (field.type !== "password" && field.type !== "url")) {
      return null;
    }

    const isPasswordVisible = visiblePasswordIds.has(field.id);
    const isOpen = openFieldMenuId === field.id;

    return (
      <DropdownMenu open={isOpen} onOpenChange={(open) => setOpenFieldMenuId(open ? field.id : null)}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="iconSm"
            aria-label={`${field.label} settings`}
          >
            <SettingsIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-[11rem] p-1">
          {field.type === "password" ? (
            <DropdownMenuItem onSelect={() => togglePasswordVisibility(field.id)}>
              {isPasswordVisible ? <HidePasswordIcon className="size-4" /> : <ShowPasswordIcon className="size-4" />}
              {isPasswordVisible ? "Hide password" : "Show password"}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => field.copyValue && navigator.clipboard.writeText(field.copyValue)}>
              <CopyIcon className="size-4" />
              Copy
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderField(section: DemoSection, field: DemoField) {
    const canReorderField = !(section.variant === "primary" && !section.title);
    const isWebsiteField = field.type === "url";

    return (
      <SortableField
        key={field.id}
        section={section}
        field={field}
        value={valueForField(field)}
        mode={mode}
        reorderable={canReorderField}
        actions={renderActions(section, field)}
        floatingActions={renderFloatingActions(field)}
        isHoverLocked={openFieldMenuId === field.id}
        copyLabel={isWebsiteField ? "Open website" : undefined}
        copySuccessLabel={isWebsiteField ? null : undefined}
        onCopyAction={isWebsiteField ? openWebsite : undefined}
        onLabelChange={(label) => updateFieldLabel(section.id, field.id, label)}
        onValueChange={(value) => updateFieldValue(section.id, field.id, value)}
      />
    );
  }

  function renderFieldPreview(section: DemoSection, field: DemoField, isDraggedField = false) {
    return (
      <KeyField
        label={field.label}
        value={valueForField(field)}
        mode={mode}
        editableLabel={field.editableLabel}
        editableValue={typeof valueForField(field) === "string"}
        reorderable
        meta={field.type === "password" ? null : metaForField(field.type, section.variant)}
        actions={renderActions(section, field)}
        className={
          isDraggedField
            ? cn("rounded-lg border border-border shadow-lg", section.variant === "additional" ? "bg-secondary" : "bg-card")
            : undefined
        }
        style={isDraggedField && activeDrag?.type === "field" && activeDrag.width ? { width: activeDrag.width } : undefined}
        valueClassName={field.type === "multiline-text" || field.type === "note" ? "whitespace-normal" : undefined}
        controlButtonClassName={section.variant === "additional" ? "hover:!bg-card" : undefined}
        copyValue={field.copyValue}
        copyLabel={field.type === "url" ? "Open website" : undefined}
        copySuccessLabel={field.type === "url" ? null : undefined}
        copyIcon={field.type === "url" ? <OpenWebsiteIcon className="size-4" /> : undefined}
        copyIconPosition={field.type === "url" ? "end" : undefined}
        copyHoverClassName={
          section.variant === "additional"
            ? "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)]"
            : "hover:bg-secondary"
        }
        copyHoverActiveClassName={
          section.variant === "additional"
            ? "bg-[color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)]"
            : "bg-secondary"
        }
        copyOverlayClassName={
          section.variant === "additional"
            ? "bg-[color-mix(in_hsl,color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)_40%,transparent)]"
            : "bg-secondary/40"
        }
        copyTextClassName={
          section.variant === "additional"
            ? "bg-[color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)]"
            : "bg-secondary"
        }
        onCopyAction={field.type === "url" ? openWebsite : undefined}
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
