import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type SVGProps } from "react";
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
import * as OTPAuth from "otpauth";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  KeyField,
  KeyForm,
  KeySection,
  Separator,
  Slider,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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

type PasswordGeneratorSettings = {
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
};

type PasswordGeneratorPreferences = PasswordGeneratorSettings & {
  length: number;
};

const defaultPasswordGeneratorSettings: PasswordGeneratorSettings = {
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: false,
};
const defaultPasswordGeneratorLength = 16;
const passwordGeneratorStorageKey = "okkey.devUi.passwordGenerator";

const passwordGeneratorCharacterSets: Record<keyof PasswordGeneratorSettings, string> = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*",
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

function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M8.14667 1.33325H7.85333C7.49971 1.33325 7.16057 1.47373 6.91053 1.72378C6.66048 1.97382 6.52 2.31296 6.52 2.66659V2.78659C6.51976 3.0204 6.45804 3.25005 6.34103 3.45248C6.22401 3.65491 6.05583 3.82301 5.85333 3.93992L5.56667 4.10659C5.36398 4.22361 5.13405 4.28522 4.9 4.28522C4.66595 4.28522 4.43603 4.22361 4.23333 4.10659L4.13333 4.05325C3.82738 3.87676 3.46389 3.82888 3.12267 3.92012C2.78145 4.01137 2.49037 4.23428 2.31333 4.53992L2.16667 4.79325C1.99018 5.09921 1.9423 5.46269 2.03354 5.80392C2.12478 6.14514 2.34769 6.43622 2.65333 6.61325L2.75333 6.67992C2.95485 6.79626 3.12241 6.96331 3.23937 7.16447C3.35632 7.36563 3.4186 7.5939 3.42 7.82658V8.16658C3.42093 8.40153 3.35977 8.63255 3.2427 8.83626C3.12563 9.03996 2.95681 9.20911 2.75333 9.32658L2.65333 9.38658C2.34769 9.56362 2.12478 9.8547 2.03354 10.1959C1.9423 10.5371 1.99018 10.9006 2.16667 11.2066L2.31333 11.4599C2.49037 11.7656 2.78145 11.9885 3.12267 12.0797C3.46389 12.171 3.82738 12.1231 4.13333 11.9466L4.23333 11.8933C4.43603 11.7762 4.66595 11.7146 4.9 11.7146C5.13405 11.7146 5.36398 11.7762 5.56667 11.8933L5.85333 12.0599C6.05583 12.1768 6.22401 12.3449 6.34103 12.5474C6.45804 12.7498 6.51976 12.9794 6.52 13.2133V13.3333C6.52 13.6869 6.66048 14.026 6.91053 14.2761C7.16057 14.5261 7.49971 14.6666 7.85333 14.6666H8.14667C8.50029 14.6666 8.83943 14.5261 9.08948 14.2761C9.33953 14.026 9.48 13.6869 9.48 13.3333V13.2133C9.48024 12.9794 9.54196 12.7498 9.65898 12.5474C9.77599 12.3449 9.94418 12.1768 10.1467 12.0599L10.4333 11.8933C10.636 11.7762 10.866 11.7146 11.1 11.7146C11.3341 11.7146 11.564 11.7762 11.7667 11.8933L11.8667 11.9466C12.1726 12.1231 12.5361 12.171 12.8773 12.0797C13.2186 11.9885 13.5096 11.7656 13.6867 11.4599L13.8333 11.1999C14.0098 10.894 14.0577 10.5305 13.9665 10.1893C13.8752 9.84803 13.6523 9.55695 13.3467 9.37992L13.2467 9.32658C13.0432 9.20911 12.8744 9.03996 12.7573 8.83626C12.6402 8.63255 12.5791 8.40153 12.58 8.16658V7.83325C12.5791 7.5983 12.6402 7.36728 12.7573 7.16358C12.8744 6.95988 13.0432 6.79072 13.2467 6.67325L13.3467 6.61325C13.6523 6.43622 13.8752 6.14514 13.9665 5.80392C14.0577 5.46269 14.0098 5.09921 13.8333 4.79325L13.6867 4.53992C13.5096 4.23428 13.2186 4.01137 12.8773 3.92012C12.5361 3.82888 12.1726 3.87676 11.8667 4.05325L11.7667 4.10659C11.564 4.22361 11.3341 4.28522 11.1 4.28522C10.866 4.28522 10.636 4.22361 10.4333 4.10659L10.1467 3.93992C9.94418 3.82301 9.77599 3.65491 9.65898 3.45248C9.54196 3.25005 9.48024 3.0204 9.48 2.78659V2.66659C9.48 2.31296 9.33953 1.97382 9.08948 1.72378C8.83943 1.47373 8.50029 1.33325 8.14667 1.33325Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 9.99992C9.10457 9.99992 10 9.10449 10 7.99992C10 6.89535 9.10457 5.99992 8 5.99992C6.89543 5.99992 6 6.89535 6 7.99992C6 9.10449 6.89543 9.99992 8 9.99992Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
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

function CopySuccessIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M4.66602 6.44499C4.66602 5.97344 4.85334 5.5212 5.18678 5.18776C5.52022 4.85432 5.97246 4.66699 6.44402 4.66699H12.2213C12.4548 4.66699 12.686 4.71298 12.9018 4.80233C13.1175 4.89169 13.3135 5.02265 13.4786 5.18776C13.6437 5.35286 13.7747 5.54886 13.864 5.76458C13.9534 5.9803 13.9993 6.2115 13.9993 6.44499V12.2223C13.9993 12.4558 13.9534 12.687 13.864 12.9027C13.7747 13.1185 13.6437 13.3145 13.4786 13.4796C13.3135 13.6447 13.1175 13.7756 12.9018 13.865C12.686 13.9543 12.4548 14.0003 12.2213 14.0003H6.44402C6.21053 14.0003 5.97932 13.9543 5.7636 13.865C5.54789 13.7756 5.35188 13.6447 5.18678 13.4796C5.02168 13.3145 4.89071 13.1185 4.80136 12.9027C4.71201 12.687 4.66602 12.4558 4.66602 12.2223V6.44499Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.67467 11.158C2.47 11.0417 2.29977 10.8733 2.18127 10.6699C2.06277 10.4665 2.00023 10.2354 2 10V3.33333C2 2.6 2.6 2 3.33333 2H10C10.5 2 10.772 2.25667 11 2.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.33398 9.33333L8.66732 10.6667L11.334 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
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

function GeneratePasswordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M8.33398 13.9997H4.66732C4.3137 13.9997 3.97456 13.8592 3.72451 13.6091C3.47446 13.3591 3.33398 13.02 3.33398 12.6663V8.66634C3.33398 8.31272 3.47446 7.97358 3.72451 7.72353C3.97456 7.47348 4.3137 7.33301 4.66732 7.33301H11.334C11.5697 7.33288 11.8013 7.39525 12.005 7.51377C12.2088 7.63229 12.3775 7.80271 12.494 8.00767" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.33398 10.6667C7.33398 10.8435 7.40422 11.013 7.52925 11.1381C7.65427 11.2631 7.82384 11.3333 8.00065 11.3333C8.17746 11.3333 8.34703 11.2631 8.47206 11.1381C8.59708 11.013 8.66732 10.8435 8.66732 10.6667C8.66732 10.4899 8.59708 10.3203 8.47206 10.1953C8.34703 10.0702 8.17746 10 8.00065 10C7.82384 10 7.65427 10.0702 7.52925 10.1953C7.40422 10.3203 7.33398 10.4899 7.33398 10.6667Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.33398 7.33333V4.66667C5.33398 3.95942 5.61494 3.28115 6.11503 2.78105C6.61513 2.28095 7.29341 2 8.00065 2C8.7079 2 9.38617 2.28095 9.88627 2.78105C10.3864 3.28115 10.6673 3.95942 10.6673 4.66667V7.33333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.666 12.667H14.666" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.666 10.667V14.667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RegeneratePasswordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M14 8C14 6.4087 13.3679 4.88258 12.2426 3.75736C11.1174 2.63214 9.5913 2 8 2C6.32263 2.00631 4.71265 2.66082 3.50667 3.82667L2 5.33333M5.33333 5.33333H2V2M2 8C2 9.5913 2.63214 11.1174 3.75736 12.2426C4.88258 13.3679 6.4087 14 8 14C9.67737 13.9937 11.2874 13.3392 12.4933 12.1733L14 10.6667M14 14V10.6667H10.6667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
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
        destructive ? "size-8 min-h-8 min-w-8 text-destructive hover:text-destructive" : "size-8 min-h-8 min-w-8 text-muted-foreground hover:text-foreground",
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
  const filledRatio = filled / safeTotal;
  const filledSegments = Math.round(filledRatio * totalSegments);
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
      {filled >= safeTotal ? (
        <path d="M5.3335 8.16667L7.16683 10L10.6668 6.5" stroke="white" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}

function KeyCounter({
  children,
  className,
  sectionVariant,
  value,
  total,
  tone = "success",
}: {
  children: ReactNode;
  className?: string;
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
        className,
      )}
    >
      {children}
      <PieIndicator value={value} total={total} tone={tone} />
    </span>
  );
}

type PasswordStrength = {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger";
  entropyBits: number;
};

const passwordStrengthTextClassName: Record<PasswordStrength["label"], string> = {
  Weak: "text-destructive",
  Fair: "text-amber-600",
  Good: "text-amber-600",
  Strong: "text-lime-600",
  Excellent: "text-lime-700",
};

function getPasswordEntropyBits(password: string): number {
  if (password.length === 0) {
    return 0;
  }

  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSymbols = /[^A-Za-z0-9]/.test(password);
  const characterPoolSize =
    (hasLowercase ? 26 : 0) +
    (hasUppercase ? 26 : 0) +
    (hasNumbers ? 10 : 0) +
    (hasSymbols ? 16 : 0);
  const uniqueRatio = new Set(password).size / password.length;
  const hasPassphraseShape = /[A-Za-z0-9]+[-_\s][A-Za-z0-9]+[-_\s][A-Za-z0-9]+/.test(password);
  const repeatedRuns = password.match(/(.)\1{2,}/g) ?? [];
  const hasCommonSequence = /(1234|abcd|qwerty|password|admin|letmein)/i.test(password);
  const hasKeyboardWalk = /(qwer|asdf|zxcv|йцу|фыв)/i.test(password);
  const hasMostlySingleCharacter = uniqueRatio <= 0.25 && password.length >= 6;

  let entropyBits = password.length * Math.log2(Math.max(characterPoolSize, 1));
  entropyBits *= Math.max(0.35, Math.min(1, uniqueRatio + 0.25));
  entropyBits += hasPassphraseShape ? 10 : 0;
  entropyBits -= repeatedRuns.reduce((penalty, run) => penalty + run.length * 2, 0);
  entropyBits -= hasCommonSequence ? 20 : 0;
  entropyBits -= hasKeyboardWalk ? 14 : 0;
  entropyBits -= hasMostlySingleCharacter ? 24 : 0;

  return Math.max(1, entropyBits);
}

function getPasswordStrength(password: string): PasswordStrength | null {
  if (password.length === 0) {
    return null;
  }

  const entropyBits = getPasswordEntropyBits(password);
  const value = Math.min(10, Math.max(1, Math.round(entropyBits / 8)));
  if (entropyBits < 36) {
    return { label: "Weak", value, tone: "danger", entropyBits };
  }
  if (entropyBits < 50) {
    return { label: "Fair", value, tone: "warning", entropyBits };
  }
  if (entropyBits < 64) {
    return { label: "Good", value, tone: "warning", entropyBits };
  }
  if (entropyBits < 80) {
    return { label: "Strong", value, tone: "success", entropyBits };
  }
  return { label: "Excellent", value, tone: "success", entropyBits };
}

function estimatePasswordCrackTime(password: string): string {
  if (!password) {
    return "Instantly";
  }

  const entropyBits = getPasswordEntropyBits(password);
  if (entropyBits < 28) return "Instantly";
  if (entropyBits < 36) return "Hours";
  if (entropyBits < 44) return "Days";
  if (entropyBits < 52) return "Months";
  if (entropyBits < 60) return "Years";
  if (entropyBits < 72) return "Decades";
  if (entropyBits < 84) return "Centuries";
  return "Forever";
}

function normalizePasswordGeneratorPreferences(value: unknown): PasswordGeneratorPreferences {
  if (!value || typeof value !== "object") {
    return { ...defaultPasswordGeneratorSettings, length: defaultPasswordGeneratorLength };
  }

  const candidate = value as Partial<Record<keyof PasswordGeneratorPreferences, unknown>>;
  const settings: PasswordGeneratorSettings = {
    uppercase: typeof candidate.uppercase === "boolean" ? candidate.uppercase : defaultPasswordGeneratorSettings.uppercase,
    lowercase: typeof candidate.lowercase === "boolean" ? candidate.lowercase : defaultPasswordGeneratorSettings.lowercase,
    numbers: typeof candidate.numbers === "boolean" ? candidate.numbers : defaultPasswordGeneratorSettings.numbers,
    symbols: typeof candidate.symbols === "boolean" ? candidate.symbols : defaultPasswordGeneratorSettings.symbols,
  };
  if (!Object.values(settings).some(Boolean)) {
    settings.lowercase = true;
  }

  const length = typeof candidate.length === "number" ? candidate.length : defaultPasswordGeneratorLength;
  return {
    ...settings,
      length: Math.min(128, Math.max(4, Math.round(length))),
  };
}

function loadPasswordGeneratorPreferences(): PasswordGeneratorPreferences {
  try {
    return normalizePasswordGeneratorPreferences(
      JSON.parse(window.localStorage.getItem(passwordGeneratorStorageKey) ?? "null"),
    );
  } catch {
    return { ...defaultPasswordGeneratorSettings, length: defaultPasswordGeneratorLength };
  }
}

function metaForField(type: string, sectionVariant: DemoSectionVariant, value?: ReactNode): ReactNode {
  if (type === "password") {
    const strength = typeof value === "string" ? getPasswordStrength(value) : null;
    if (!strength) {
      return null;
    }

    return (
      <KeyCounter className="mr-2" sectionVariant={sectionVariant} value={strength.value} total={10} tone={strength.tone}>
        {strength.label}
      </KeyCounter>
    );
  }
  if (type === "recovery-codes") {
    return (
      <KeyCounter className="mr-2" sectionVariant={sectionVariant} value={2} total={10} tone="warning">
        2 of 10
      </KeyCounter>
    );
  }
  return null;
}

function generatePassword(settings: PasswordGeneratorSettings, length = 20): string {
  const enabledSets = (Object.keys(settings) as Array<keyof PasswordGeneratorSettings>)
    .filter((key) => settings[key])
    .map((key) => passwordGeneratorCharacterSets[key]);
  const pool = enabledSets.join("");

  if (!pool) {
    return "";
  }

  const targetLength = Math.max(length, enabledSets.length);
  const values = new Uint32Array(targetLength);
  window.crypto.getRandomValues(values);
  const requiredCharacters = enabledSets.map((set, index) => set[values[index] % set.length]);
  const remainingCharacters = Array.from(
    values.slice(enabledSets.length),
    (value) => pool[value % pool.length],
  );
  const characters = [...requiredCharacters, ...remainingCharacters];

  const shuffleValues = new Uint32Array(characters.length);
  window.crypto.getRandomValues(shuffleValues);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = shuffleValues[index] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}

function renderGeneratedPassword(password: string): ReactNode {
  return Array.from(password).map((character, index) => {
    const key = `${character}-${index}`;
    if (/\d/.test(character)) {
      return (
        <span key={key} className="text-lime-600">
          {character}
        </span>
      );
    }
    if (passwordGeneratorCharacterSets.symbols.includes(character)) {
      return (
        <span key={key} className="text-orange-600">
          {character}
        </span>
      );
    }
    return <span key={key}>{character}</span>;
  });
}

type TotpTokenState = {
  token: string;
  remainingSeconds: number;
  period: number;
};

function createTotp(value: string): OTPAuth.TOTP | null {
  const secret = value.trim();
  if (!secret) {
    return null;
  }

  try {
    const parsed = OTPAuth.URI.parse(secret);
    return parsed instanceof OTPAuth.TOTP ? parsed : null;
  } catch {
    try {
      const normalizedSecret = secret.replace(/\s+/g, "").replace(/=+$/g, "").toUpperCase();
      if (!/^[A-Z2-7]+$/.test(normalizedSecret) || normalizedSecret.length < 16) {
        return null;
      }

      return new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(normalizedSecret),
        digits: 6,
        period: 60,
      });
    } catch {
      return null;
    }
  }
}

function getTotpTokenState(value: string, timestamp: number): TotpTokenState | null {
  const totp = createTotp(value);
  if (!totp) {
    return null;
  }

  const remainingMs = totp.remaining({ timestamp });
  return {
    token: totp.generate({ timestamp }).padStart(6, "0"),
    remainingSeconds: Math.max(0, Math.ceil(remainingMs / 1000) - 1),
    period: totp.period,
  };
}

function renderTotpToken(token: string): ReactNode {
  const first = token.slice(0, 3);
  const second = token.slice(3);

  return (
    <span className="font-mono text-[15px] tabular-nums">
      {first}
      <span className="mx-1 text-muted-foreground">•</span>
      {second}
    </span>
  );
}

function createInitialSections(): DemoSection[] {
  return [
    {
      id: "credentials",
      variant: "primary",
      fields: [
        { id: "login", type: "username", label: "login", value: "shadcn@vercel.com", copyValue: "shadcn@vercel.com" },
        { id: "password", type: "password", label: "password", value: "correct-horse-battery-staple", copyValue: "correct-horse-battery-staple", secret: true },
        {
          id: "totp",
          type: "totp",
          label: "one-time password (totp)",
          value: "",
          copyValue: "",
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
  autoFocusValue?: boolean;
  onLabelChange: (label: string) => void;
  onValueChange: (value: string) => void;
  actions: ReactNode;
  floatingActions?: ReactNode;
  isHoverLocked?: boolean;
  forceActive?: boolean;
  isInvalid?: boolean;
  fieldOverlay?: ReactNode;
  showBottomBorder?: boolean;
  hideTopBorder?: boolean;
  hideBottomBorder?: boolean;
  copyValue?: string;
  copyLabel?: string;
  copySuccessLabel?: string | null;
  concealValue?: boolean;
  onCopyAction?: (value: string) => void | Promise<void>;
};

function SortableField({
  section,
  field,
  value,
  mode,
  reorderable,
  autoFocusValue,
  onLabelChange,
  onValueChange,
  actions,
  floatingActions,
  isHoverLocked,
  forceActive,
  isInvalid,
  fieldOverlay,
  showBottomBorder,
  hideTopBorder,
  hideBottomBorder,
  copyValue,
  copyLabel,
  copySuccessLabel,
  concealValue,
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
      multilineValue={field.type === "multiline-text"}
      autoFocusValue={autoFocusValue}
      reorderable={reorderable}
      meta={field.type === "password" || field.type === "recovery-codes" || field.type === "totp" ? null : metaForField(field.type, section.variant)}
      actions={actions}
      floatingActions={floatingActions}
      isHoverLocked={isHoverLocked}
      forceActive={forceActive}
      isInvalid={isInvalid}
      fieldOverlay={fieldOverlay}
      concealValue={concealValue}
      className={cn(
        section.variant === "primary" && "border-x-transparent",
        section.variant === "additional" && "border-x-transparent",
        section.variant === "additional" && (showBottomBorder ? "border-b-border" : "border-b-transparent"),
        hideTopBorder && "border-t-transparent",
        hideBottomBorder && "border-b-transparent",
        isDragging && "relative z-10 opacity-0",
      )}
      style={style}
      valueClassName={field.type === "multiline-text" || field.type === "note" ? "whitespace-pre-wrap break-words" : undefined}
      controlButtonClassName={section.variant === "additional" ? "hover:!bg-card" : undefined}
      copyValue={copyValue ?? field.copyValue}
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
  const [activeValueFieldId, setActiveValueFieldId] = useState<string | null>(null);
  const [passwordGeneratorFieldId, setPasswordGeneratorFieldId] = useState<string | null>(null);
  const [passwordGeneratorPreferences, setPasswordGeneratorPreferences] = useState<PasswordGeneratorPreferences>(
    loadPasswordGeneratorPreferences,
  );
  const { length: passwordGeneratorLength, ...passwordGeneratorSettings } = passwordGeneratorPreferences;
  const [generatedPassword, setGeneratedPassword] = useState(() =>
    generatePassword(passwordGeneratorSettings, passwordGeneratorLength),
  );
  const [isGeneratedPasswordCopied, setIsGeneratedPasswordCopied] = useState(false);
  const [totpTimestamp, setTotpTimestamp] = useState(() => Date.now());
  const nextIdRef = useRef(1);
  const generatedPasswordCopyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    window.localStorage.setItem(passwordGeneratorStorageKey, JSON.stringify(passwordGeneratorPreferences));
  }, [passwordGeneratorPreferences]);

  useEffect(
    () => () => {
      if (generatedPasswordCopyResetTimeoutRef.current) {
        clearTimeout(generatedPasswordCopyResetTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => setTotpTimestamp(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!passwordGeneratorFieldId) {
      return undefined;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest("[data-password-generator-panel]") ||
        target?.closest("[data-password-generator-trigger]")
      ) {
        return;
      }
      closePasswordGenerator();
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [passwordGeneratorFieldId]);

  function createField(type: KeyFieldTypeOption): DemoField {
    const id = `field-${nextIdRef.current++}`;
    return {
      id,
      type: type.id,
      label: type.label.toLowerCase(),
      value: "",
      copyValue: "",
      editableLabel: true,
      secret: ["password", "recovery-codes"].includes(type.id),
    };
  }

  function addSection(type: KeyFieldTypeOption) {
    const sectionId = `section-${nextIdRef.current++}`;
    const field = createField(type);
    setActiveValueFieldId(field.id);
    setSections((current) => [
      ...current,
      {
        id: sectionId,
        variant: "additional",
        title: type.label,
        fields: [field],
      },
    ]);
  }

  function addField(sectionId: string, type: KeyFieldTypeOption) {
    const field = createField(type);
    setActiveValueFieldId(field.id);
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, fields: [...section.fields, field] } : section,
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
    if (activeValueFieldId === fieldId) {
      setActiveValueFieldId(null);
    }
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.map((field) =>
                field.id === fieldId
                  ? { ...field, value, copyValue: field.type === "password" ? value : field.secret ? field.copyValue : value }
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

  function openPasswordGenerator(fieldId: string) {
    setOpenFieldMenuId(null);
    setPasswordGeneratorFieldId(fieldId);
    setGeneratedPassword(generatePassword(passwordGeneratorSettings, passwordGeneratorLength));
  }

  function updatePasswordGeneratorSetting(key: keyof PasswordGeneratorSettings, checked: boolean) {
    setPasswordGeneratorPreferences((current) => {
      const next = { ...current, [key]: checked };
      const hasEnabledSet = next.uppercase || next.lowercase || next.numbers || next.symbols;
      const safeNext = hasEnabledSet ? next : current;
      const { length, ...settings } = safeNext;
      setGeneratedPassword(generatePassword(settings, length));
      return safeNext;
    });
  }

  function updatePasswordGeneratorLength(length: number) {
    setPasswordGeneratorPreferences((current) => {
      const next = { ...current, length };
      const { length: nextLength, ...settings } = next;
      setGeneratedPassword(generatePassword(settings, nextLength));
      return next;
    });
  }

  function regeneratePassword() {
    setGeneratedPassword(generatePassword(passwordGeneratorSettings, passwordGeneratorLength));
  }

  async function copyGeneratedPassword() {
    await navigator.clipboard.writeText(generatedPassword);
    setIsGeneratedPasswordCopied(true);
    if (generatedPasswordCopyResetTimeoutRef.current) {
      clearTimeout(generatedPasswordCopyResetTimeoutRef.current);
    }
    generatedPasswordCopyResetTimeoutRef.current = setTimeout(() => {
      setIsGeneratedPasswordCopied(false);
      generatedPasswordCopyResetTimeoutRef.current = null;
    }, 3000);
  }

  function insertGeneratedPassword(sectionId: string, fieldId: string) {
    updateFieldValue(sectionId, fieldId, generatedPassword);
    closePasswordGenerator();
  }

  function closePasswordGenerator() {
    setPasswordGeneratorFieldId(null);
  }

  function renderPasswordGeneratorPanel(section: DemoSection, field: DemoField) {
    if (passwordGeneratorFieldId !== field.id) {
      return null;
    }

    const options: Array<{ key: keyof PasswordGeneratorSettings; label: string }> = [
      { key: "uppercase", label: "A-Z" },
      { key: "lowercase", label: "a-z" },
      { key: "numbers", label: "0-9" },
      { key: "symbols", label: "!@#$%^&*" },
    ];
    const generatedStrength = getPasswordStrength(generatedPassword);
    const crackTime = estimatePasswordCrackTime(generatedPassword);

    return (
      <div
        data-password-generator-panel
        className={cn(
          "absolute left-10 top-full z-40 mt-2 w-[420px] rounded-md bg-popover p-3 text-popover-foreground",
          "shadow-[0_4px_16px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)]",
          "dark:shadow-[0_8px_28px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.1)]",
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="absolute -top-1.5 left-10 size-3 rotate-45 bg-popover shadow-[-1px_-1px_0_rgba(0,0,0,0.05)] dark:shadow-[-1px_-1px_0_rgba(255,255,255,0.1)]" aria-hidden />
        <div className="relative flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-lg bg-secondary p-3">
            <div className="flex items-center justify-between gap-4">
              {options.map((option) => (
                <label
                  key={option.key}
                  className="flex cursor-pointer select-none items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox
                    checked={passwordGeneratorSettings[option.key]}
                    onCheckedChange={(checked) => updatePasswordGeneratorSetting(option.key, checked === true)}
                  />
                  {option.label}
                </label>
              ))}
            </div>

            <Separator className="-mx-3 w-auto self-stretch bg-border" />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">Characters: {passwordGeneratorLength}</span>
                <span className="text-xs text-muted-foreground">4-128</span>
              </div>
              <Slider
                value={[passwordGeneratorLength]}
                min={4}
                max={128}
                step={1}
                onValueChange={(value) => updatePasswordGeneratorLength(value[0] ?? passwordGeneratorLength)}
                aria-label="Password length"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className="min-w-0 flex-1 break-all font-mono text-sm font-semibold leading-5 text-foreground">
              {renderGeneratedPassword(generatedPassword)}
            </span>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    className={cn(
                      "size-8 min-h-8 min-w-8 text-muted-foreground hover:text-foreground",
                      section.variant === "additional" && "hover:!bg-secondary",
                    )}
                    aria-label="Copy generated password"
                    onClick={copyGeneratedPassword}
                  >
                    {isGeneratedPasswordCopied ? <CopySuccessIcon className="size-4" /> : <CopyIcon className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isGeneratedPasswordCopied ? "Copied" : "Copy"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    className={cn(
                      "size-8 min-h-8 min-w-8 text-muted-foreground hover:text-foreground",
                      section.variant === "additional" && "hover:!bg-secondary",
                    )}
                    aria-label="Regenerate password"
                    onClick={regeneratePassword}
                  >
                    <RegeneratePasswordIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Regenerate</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center justify-between gap-3 px-3 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              Strength:{" "}
              {generatedStrength ? (
                <span className={cn("font-medium", passwordStrengthTextClassName[generatedStrength.label])}>
                  {generatedStrength.label}
                </span>
              ) : (
                <span className="font-medium text-muted-foreground">Weak</span>
              )}
            </span>
            <span className="shrink-0 text-muted-foreground">
              Crack time:{" "}
              <span
                className={cn(
                  "font-medium",
                  generatedStrength ? passwordStrengthTextClassName[generatedStrength.label] : "text-muted-foreground",
                )}
              >
                {crackTime}
              </span>
            </span>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closePasswordGenerator}>
              Cancel
            </Button>
            <Button type="button" onClick={() => insertGeneratedPassword(section.id, field.id)}>
              Insert
            </Button>
          </div>
        </div>
      </div>
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
    const isPasswordVisible = field.type === "password" && visiblePasswordIds.has(field.id);
    const isFieldMenuOpen = openFieldMenuId === field.id;
    const isPasswordGeneratorOpen = passwordGeneratorFieldId === field.id;
    const fieldMeta = metaForField(field.type, section.variant, valueForField(section, field));
    if (!canEdit) {
      return (field.type === "password" || field.type === "recovery-codes") && fieldMeta ? (
        <span className={cn("transition-opacity group-hover/key-field:opacity-0", isFieldMenuOpen && "opacity-0")}>
          {fieldMeta}
        </span>
      ) : null;
    }

    return (
      <>
        {field.type === "password" || field.type === "recovery-codes" ? fieldMeta : null}
        {field.type === "password" ? (
          <>
            <DropdownMenu
              open={isFieldMenuOpen}
              onOpenChange={(open) => setOpenFieldMenuId(open ? field.id : null)}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                data-password-generator-trigger
                  className={cn(
                    "size-8 min-h-8 min-w-8 text-muted-foreground hover:text-foreground",
                    section.variant === "additional" && "hover:!bg-card",
                    (isFieldMenuOpen || isPasswordGeneratorOpen) &&
                      "!bg-white text-foreground hover:!bg-white dark:!bg-card dark:hover:!bg-card",
                  )}
                  aria-label={`${field.label} settings`}
                >
                  <GearIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-[13rem] p-1">
                <DropdownMenuItem onSelect={() => togglePasswordVisibility(field.id)}>
                  {isPasswordVisible ? <HidePasswordIcon className="size-4" /> : <ShowPasswordIcon className="size-4" />}
                  {isPasswordVisible ? "Hide password" : "Show password"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openPasswordGenerator(field.id)}>
                  <GeneratePasswordIcon className="size-4" />
                  Generate password
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : field.type === "totp" ? (
          <DropdownMenu
            open={isFieldMenuOpen}
            onOpenChange={(open) => setOpenFieldMenuId(open ? field.id : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                className={cn(
                  "size-8 min-h-8 min-w-8 text-muted-foreground hover:text-foreground",
                  section.variant === "additional" && "hover:!bg-card",
                  isFieldMenuOpen && "!bg-white text-foreground hover:!bg-white dark:!bg-card dark:hover:!bg-card",
                )}
                aria-label={`${field.label} settings`}
              >
                <GearIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-[13rem] p-1">
              <DropdownMenuItem onSelect={() => resetTotpSecret(section.id, field.id)}>
                Enter new TOTP secret
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : field.secret ? (
          <ActionButton label="Show value" sectionVariant={section.variant}>
            <EyeIcon className="size-4" />
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

  function resetTotpSecret(sectionId: string, fieldId: string) {
    setOpenFieldMenuId(null);
    updateFieldValue(sectionId, fieldId, "");
    setActiveValueFieldId(fieldId);
  }

  function openWebsite(value: string) {
    const openedWindow = window.open(value, "_blank", "noopener,noreferrer");
    if (openedWindow) {
      openedWindow.opener = null;
    }
  }

  function valueForField(section: DemoSection, field: DemoField): ReactNode {
    if (field.type === "totp" && typeof field.value === "string") {
      const tokenState = getTotpTokenState(field.value, totpTimestamp);
      if (tokenState) {
        const timerTone = tokenState.remainingSeconds <= 2 ? "danger" : tokenState.remainingSeconds <= 5 ? "warning" : "success";
        return (
          <span className="inline-flex items-center gap-2">
            {renderTotpToken(tokenState.token)}
            <KeyCounter className="font-mono tabular-nums" sectionVariant={section.variant} value={tokenState.remainingSeconds} total={tokenState.period} tone={timerTone}>
              {tokenState.remainingSeconds}
            </KeyCounter>
          </span>
        );
      }
    }

    return field.value;
  }

  function isInvalidTotpField(field: DemoField): boolean {
    return field.type === "totp" && typeof field.value === "string" && field.value.trim().length > 0 && !createTotp(field.value);
  }

  function copyValueForField(field: DemoField): string | undefined {
    if (field.type === "totp" && typeof field.value === "string") {
      return getTotpTokenState(field.value, totpTimestamp)?.token;
    }

    return field.copyValue;
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
    const canReorderField = section.id === "websites" || !(section.variant === "primary" && !section.title);
    const isWebsiteField = field.type === "url";
    const isPasswordGeneratorOpen = passwordGeneratorFieldId === field.id;
    const isTotpInvalid = isInvalidTotpField(field);
    const isFieldDraggingInSection = activeDrag?.type === "field" && activeDrag.sectionId === section.id;
    const isFirstField = section.fields[0]?.id === field.id;
    const isLastField = section.fields[section.fields.length - 1]?.id === field.id;
    const hasAddFieldButton = mode === "edit" && section.id === "websites";

    return (
      <SortableField
        key={field.id}
        section={section}
        field={field}
        value={valueForField(section, field)}
        mode={mode}
        reorderable={canReorderField}
        autoFocusValue={activeValueFieldId === field.id}
        actions={renderActions(section, field)}
        floatingActions={renderFloatingActions(field)}
        isHoverLocked={openFieldMenuId === field.id}
        forceActive={isPasswordGeneratorOpen}
        isInvalid={isTotpInvalid}
        fieldOverlay={field.type === "password" ? renderPasswordGeneratorPanel(section, field) : undefined}
        showBottomBorder={section.variant === "additional" && activeDrag?.type === "field"}
        hideTopBorder={section.variant === "primary" && !section.title && isFirstField && !isFieldDraggingInSection}
        hideBottomBorder={section.variant === "primary" && isLastField && !hasAddFieldButton}
        copyValue={copyValueForField(field)}
        copyLabel={isWebsiteField ? "Open website" : undefined}
        copySuccessLabel={isWebsiteField ? null : undefined}
        concealValue={field.type === "password" && !visiblePasswordIds.has(field.id) && !isPasswordGeneratorOpen}
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
        value={valueForField(section, field)}
        mode={mode}
        editableLabel={field.editableLabel}
        editableValue={typeof valueForField(section, field) === "string"}
        multilineValue={field.type === "multiline-text"}
        reorderable
        meta={field.type === "password" || field.type === "recovery-codes" || field.type === "totp" ? null : metaForField(field.type, section.variant)}
        actions={renderActions(section, field)}
        isInvalid={isInvalidTotpField(field)}
        concealValue={field.type === "password" && !visiblePasswordIds.has(field.id)}
        className={cn(
          !isDraggedField && section.variant === "primary" && "border-x-transparent",
          !isDraggedField && section.variant === "additional" && "border-x-transparent border-b-transparent",
          isDraggedField &&
            cn(
              "rounded-lg border border-x-border border-y-border shadow-lg",
              section.variant === "additional" ? "bg-secondary" : "bg-card",
            ),
        )}
        style={isDraggedField && activeDrag?.type === "field" && activeDrag.width ? { width: activeDrag.width } : undefined}
        valueClassName={field.type === "multiline-text" || field.type === "note" ? "whitespace-pre-wrap break-words" : undefined}
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
                      isFieldDragging={activeDrag?.type === "field" && activeDrag.sectionId === section.id}
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
