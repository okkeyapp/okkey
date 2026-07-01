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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  KeyField,
  KeyFieldOverlayPanel,
  KeyForm,
  KeySection,
  Separator,
  Slider,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  getKeyFieldSurfaceRounding,
  keyFormAdditionalFieldBorderClassName,
  buildKeyFieldAddressMapsUrl,
  emptyKeyFieldAddressValue,
  emptyKeyFieldRecoveryCodesValue,
  formatKeyFieldAddressCopyValue,
  getFirstUnusedKeyFieldRecoveryCode,
  getKeyFieldRecoveryCodesRemainingCount,
  getKeyFieldRecoveryCodesUsedCount,
  isValidKeyFieldDateValue,
  markFirstUnusedKeyFieldRecoveryCodeUsed,
  parseKeyFieldAddressValue,
  parseKeyFieldRecoveryCodesValue,
  serializeKeyFieldAddressValue,
  serializeKeyFieldRecoveryCodesValue,
  type KeyFieldValueTransformContext,
  type KeyFieldTypeOption,
  type KeyFieldSecretKind,
  type KeyFormMode,
  type KeyFieldFileValue,
} from "@okkey/ui";
import { uploadDevKeyFieldFile } from "../../api/key-field-files";
import {
  englishKeyFieldTypes,
  englishKeyFormEditorMessages,
  formatKeyFormMessage,
  type CrackTimeLabelKey,
  type KeyFormEditorMessages,
  type KeyFormUrlAutofillScope,
  type PasswordStrengthLabelKey,
} from "./keyFormI18n";
import {
  getSecretKind,
  isConfigurableSecretField,
  isFixedPasswordField,
  isSecretFieldEmpty,
  isSecretLikeField,
  secretFieldShowsStrength,
  shouldConcealSecretField,
  shouldOpenGeneratorOnFocus,
  showSecretLabelKey,
} from "./keyFormSecretField";

export type { KeyFormUrlAutofillScope } from "./keyFormI18n";

export type KeyFormEditorSectionVariant = "primary" | "additional";

export type KeyFormEditorField = {
  id: string;
  type: string;
  label: string;
  value: ReactNode;
  copyValue?: string;
  editableLabel?: boolean;
  secret?: boolean;
  secretKind?: KeyFieldSecretKind;
  deletable?: boolean;
  required?: boolean;
  urlAutofillScope?: KeyFormUrlAutofillScope;
};

export type KeyFormEditorSection = {
  id: string;
  variant: KeyFormEditorSectionVariant;
  title?: string;
  fields: KeyFormEditorField[];
};

export type KeyFormEditorProps = {
  initialSections?: readonly KeyFormEditorSection[];
  mode?: KeyFormMode;
  addSectionLabel?: string;
  addFieldLabel?: string;
  fieldTypes?: readonly KeyFieldTypeOption[];
  messages?: KeyFormEditorMessages;
  className?: string;
  onSectionsChange?: (sections: KeyFormEditorSection[]) => void;
  onWebsiteUrlsBlur?: (sections: KeyFormEditorSection[]) => void;
  onRecoveryCodesValueChange?: (change: RecoveryCodesValueChange) => void | Promise<void>;
  /** When true, empty required fields are marked invalid. */
  showValidation?: boolean;
};

export type RecoveryCodesValueChange = {
  sectionId: string;
  fieldId: string;
  value: string;
};

type DemoSectionVariant = KeyFormEditorSectionVariant;

type DemoField = KeyFormEditorField;

function fieldValuePlaceholderKey(field: Pick<DemoField, "id" | "type">): string {
  if (field.id === "login") {
    return "login";
  }
  if (field.id === "password") {
    return "password";
  }
  return field.type;
}

function fieldDisplayLabel(field: Pick<DemoField, "id" | "type" | "label">, messages: KeyFormEditorMessages): string {
  const trimmed = field.label?.trim();
  if (trimmed) {
    return trimmed;
  }
  return messages.fieldLabels[fieldValuePlaceholderKey(field)] ?? field.id;
}

const FORM_ENTITY_ID_PATTERN = /^(?:section|field)-(\d+)$/;

function getNextFormEntityCounter(sections: readonly DemoSection[]): number {
  let max = 0;

  for (const section of sections) {
    const sectionMatch = section.id.match(FORM_ENTITY_ID_PATTERN);
    if (sectionMatch) {
      max = Math.max(max, Number.parseInt(sectionMatch[1], 10));
    }

    for (const field of section.fields) {
      const fieldMatch = field.id.match(FORM_ENTITY_ID_PATTERN);
      if (fieldMatch) {
        max = Math.max(max, Number.parseInt(fieldMatch[1], 10));
      }
    }
  }

  return max + 1;
}

type DemoSection = KeyFormEditorSection;

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
      <path d="M1.33325 7.99992C1.33325 7.99992 3.33325 3.33325 7.99992 3.33325C12.6666 3.33325 14.6666 7.99992 14.6666 7.99992C14.6666 7.99992 12.6666 12.6666 7.99992 12.6666C3.33325 12.6666 1.33325 7.99992 1.33325 7.99992Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.99992 9.99992C9.10449 9.99992 9.99992 9.10449 9.99992 7.99992C9.99992 6.89535 9.10449 5.99992 7.99992 5.99992C6.89535 5.99992 5.99992 6.89535 5.99992 7.99992C5.99992 9.10449 6.89535 9.99992 7.99992 9.99992Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M2 3.99992H14M12.6667 3.99992V13.3333C12.6667 13.9999 12 14.6666 11.3333 14.6666H4.66667C4 14.6666 3.33333 13.9999 3.33333 13.3333V3.99992M5.33333 3.99992V2.66659C5.33333 1.99992 6 1.33325 6.66667 1.33325H9.33333C10 1.33325 10.6667 1.99992 10.6667 2.66659V3.99992M6.66667 7.33325V11.3333M9.33333 7.33325V11.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpenMapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M6 7.3335C6 7.86393 6.21071 8.37264 6.58579 8.74771C6.96086 9.12278 7.46957 9.3335 8 9.3335C8.53043 9.3335 9.03914 9.12278 9.41421 8.74771C9.78929 8.37264 10 7.86393 10 7.3335C10 6.80306 9.78929 6.29436 9.41421 5.91928C9.03914 5.54421 8.53043 5.3335 8 5.3335C7.46957 5.3335 6.96086 5.54421 6.58579 5.91928C6.21071 6.29436 6 6.80306 6 7.3335Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.7713 11.1045L8.94263 13.9331C8.69262 14.1829 8.35368 14.3232 8.0003 14.3232C7.64691 14.3232 7.30797 14.1829 7.05796 13.9331L4.22863 11.1045C3.48278 10.3586 2.97485 9.40827 2.76909 8.37371C2.56332 7.33916 2.66896 6.26681 3.07263 5.29229C3.47631 4.31777 4.15989 3.48483 5.03695 2.89881C5.91401 2.31279 6.94514 2 7.99996 2C9.05478 2 10.0859 2.31279 10.963 2.89881C11.84 3.48483 12.5236 4.31777 12.9273 5.29229C13.331 6.26681 13.4366 7.33916 13.2308 8.37371C13.0251 9.40827 12.5171 10.3586 11.7713 11.1045Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
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

function EnableCopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M4.66663 6.4445C4.66663 5.97295 4.85395 5.52071 5.18739 5.18727C5.52083 4.85383 5.97307 4.6665 6.44463 4.6665H12.222C12.4554 4.6665 12.6867 4.71249 12.9024 4.80185C13.1181 4.8912 13.3141 5.02217 13.4792 5.18727C13.6443 5.35237 13.7753 5.54838 13.8646 5.76409C13.954 5.97981 14 6.21101 14 6.4445V12.2218C14 12.4553 13.954 12.6865 13.8646 12.9022C13.7753 13.118 13.6443 13.314 13.4792 13.4791C13.3141 13.6442 13.1181 13.7751 12.9024 13.8645C12.6867 13.9538 12.4554 13.9998 12.222 13.9998H6.44463C6.21114 13.9998 5.97993 13.9538 5.76421 13.8645C5.5485 13.7751 5.35249 13.6442 5.18739 13.4791C5.02229 13.314 4.89132 13.118 4.80197 12.9022C4.71262 12.6865 4.66663 12.4553 4.66663 12.2218V6.4445Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.67467 11.158C2.47023 11.0415 2.30018 10.873 2.18172 10.6697C2.06325 10.4663 2.00057 10.2353 2 10V3.33333C2 2.6 2.6 2 3.33333 2H10C10.5 2 10.772 2.25667 11 2.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DisableCopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M12.9427 12.9435C12.6926 13.1933 12.3535 13.3336 12 13.3335H6.66671C6.31309 13.3335 5.97395 13.193 5.7239 12.943C5.47385 12.6929 5.33337 12.3538 5.33337 12.0002V6.66683C5.33337 6.2975 5.48337 5.9635 5.72604 5.72216M8.00004 5.3335H12C12.3537 5.3335 12.6928 5.47397 12.9428 5.72402C13.1929 5.97407 13.3334 6.31321 13.3334 6.66683V10.6668" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.6666 5.33317V3.99984C10.6666 3.64622 10.5262 3.30708 10.2761 3.05703C10.0261 2.80698 9.68691 2.6665 9.33329 2.6665H5.33329M3.05463 3.05984C2.81463 3.29984 2.66663 3.63317 2.66663 3.99984V9.33317C2.66663 9.68679 2.8071 10.0259 3.05715 10.276C3.3072 10.526 3.64634 10.6665 3.99996 10.6665H5.33329" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 2L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
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
      <path d="M7.33337 14.0002H4.66671C4.31309 14.0002 3.97395 13.8597 3.7239 13.6096C3.47385 13.3596 3.33337 13.0205 3.33337 12.6668V8.66683C3.33337 8.31321 3.47385 7.97407 3.7239 7.72402C3.97395 7.47397 4.31309 7.3335 4.66671 7.3335H10.6667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.33337 7.33333V4.66667C5.33337 3.95942 5.61433 3.28115 6.11442 2.78105C6.61452 2.28095 7.2928 2 8.00004 2C8.70728 2 9.38556 2.28095 9.88566 2.78105C10.3858 3.28115 10.6667 3.95942 10.6667 4.66667V7.33333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.8667 13.878L10.4187 14.6367C10.3757 14.659 10.3274 14.669 10.2791 14.6655C10.2308 14.662 10.1844 14.6451 10.1451 14.6167C10.1058 14.5884 10.0752 14.5497 10.0566 14.5049C10.0381 14.4602 10.0323 14.4111 10.04 14.3633L10.3167 12.756L9.14537 11.618C9.11041 11.5842 9.08565 11.5412 9.07393 11.494C9.06221 11.4468 9.06399 11.3973 9.07908 11.3511C9.09416 11.3049 9.12194 11.2638 9.15924 11.2326C9.19655 11.2014 9.24187 11.1813 9.29004 11.1746L10.9087 10.94L11.6327 9.47798C11.6544 9.43444 11.6877 9.3978 11.7291 9.37219C11.7704 9.34658 11.8181 9.33301 11.8667 9.33301C11.9153 9.33301 11.963 9.34658 12.0043 9.37219C12.0457 9.3978 12.0791 9.43444 12.1007 9.47798L12.8247 10.94L14.4434 11.1746C14.4914 11.1816 14.5365 11.2018 14.5737 11.233C14.6108 11.2642 14.6385 11.3052 14.6535 11.3513C14.6686 11.3975 14.6704 11.4469 14.6588 11.494C14.6473 11.5411 14.6227 11.5841 14.588 11.618L13.4167 12.756L13.6927 14.3627C13.701 14.4106 13.6957 14.4598 13.6774 14.5049C13.659 14.5499 13.6285 14.5889 13.5891 14.6175C13.5497 14.646 13.5032 14.6629 13.4546 14.6663C13.4061 14.6697 13.3577 14.6594 13.3147 14.6367L11.8667 13.878Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EnterTotpSecretIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M8.33337 14.0002H4.66671C4.31309 14.0002 3.97395 13.8597 3.7239 13.6096C3.47385 13.3596 3.33337 13.0205 3.33337 12.6668V8.66683C3.33337 8.31321 3.47385 7.97407 3.7239 7.72402C3.97395 7.47397 4.31309 7.3335 4.66671 7.3335H11.3334C11.5691 7.33337 11.8007 7.39574 12.0044 7.51426C12.2082 7.63278 12.3769 7.8032 12.4934 8.00816" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.33337 10.6667C7.33337 10.8435 7.40361 11.013 7.52864 11.1381C7.65366 11.2631 7.82323 11.3333 8.00004 11.3333C8.17685 11.3333 8.34642 11.2631 8.47145 11.1381C8.59647 11.013 8.66671 10.8435 8.66671 10.6667C8.66671 10.4899 8.59647 10.3203 8.47145 10.1953C8.34642 10.0702 8.17685 10 8.00004 10C7.82323 10 7.65366 10.0702 7.52864 10.1953C7.40361 10.3203 7.33337 10.4899 7.33337 10.6667Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.33337 7.33333V4.66667C5.33337 3.95942 5.61433 3.28115 6.11442 2.78105C6.61452 2.28095 7.2928 2 8.00004 2C8.70728 2 9.38556 2.28095 9.88566 2.78105C10.3858 3.28115 10.6667 3.95942 10.6667 4.66667V7.33333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.6666 12.6665H14.6666" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6666 10.6665V14.6665" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DisableMaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M12.9466 12.9398C12.8226 13.0646 12.6751 13.1636 12.5126 13.2311C12.3501 13.2986 12.1759 13.3333 12 13.3332H3.99996C3.64634 13.3332 3.3072 13.1927 3.05715 12.9426C2.8071 12.6926 2.66663 12.3535 2.66663 11.9998V3.99984C2.66663 3.6305 2.81663 3.2965 3.05863 3.05517M5.33329 2.6665H12C12.3536 2.6665 12.6927 2.80698 12.9428 3.05703C13.1928 3.30708 13.3333 3.64622 13.3333 3.99984V10.6665" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.59001 6.58114C6.40193 6.76642 6.25238 6.98709 6.15001 7.23045C6.04764 7.4738 5.99446 7.73502 5.99354 7.99903C5.99263 8.26304 6.04399 8.52461 6.14467 8.76867C6.24535 9.01273 6.39336 9.23444 6.58015 9.42102C6.76694 9.60759 6.98883 9.75534 7.23301 9.85573C7.47718 9.95612 7.73882 10.0072 8.00283 10.0059C8.26684 10.0047 8.52799 9.95123 8.77123 9.84857C9.01446 9.74591 9.23496 9.59611 9.42001 9.40781M9.80801 7.14381C9.60863 6.72402 9.26982 6.38639 8.84934 6.18848" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 2L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EnableMaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M6 8C6 8.53043 6.21071 9.03914 6.58579 9.41421C6.96086 9.78929 7.46957 10 8 10C8.53043 10 9.03914 9.78929 9.41421 9.41421C9.78929 9.03914 10 8.53043 10 8C10 7.46957 9.78929 6.96086 9.41421 6.58579C9.03914 6.21071 8.53043 6 8 6C7.46957 6 6.96086 6.21071 6.58579 6.58579C6.21071 6.96086 6 7.46957 6 8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.66663 3.99984C2.66663 3.64622 2.8071 3.30708 3.05715 3.05703C3.3072 2.80698 3.64634 2.6665 3.99996 2.6665H12C12.3536 2.6665 12.6927 2.80698 12.9428 3.05703C13.1928 3.30708 13.3333 3.64622 13.3333 3.99984V11.9998C13.3333 12.3535 13.1928 12.6926 12.9428 12.9426C12.6927 13.1927 12.3536 13.3332 12 13.3332H3.99996C3.64634 13.3332 3.3072 13.1927 3.05715 12.9426C2.8071 12.6926 2.66663 12.3535 2.66663 11.9998V3.99984Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
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

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const URL_AUTOFILL_SCOPES: KeyFormUrlAutofillScope[] = ["entire-site", "exact-url", "none"];

function sectionHasTotpField(section: DemoSection): boolean {
  return section.fields.some((field) => field.type === "totp");
}

function canDeleteField(section: DemoSection, field: DemoField): boolean {
  if (field.deletable === false) {
    return false;
  }

  if (section.id === "credentials") {
    if (field.id === "login" || field.id === "password" || field.type === "password") {
      return false;
    }
  }

  if (section.id === "websites" && field.type === "url") {
    return section.fields.filter((item) => item.type === "url").length > 1;
  }

  return true;
}

function sectionHasAddFieldButton(section: DemoSection, mode: KeyFormMode): boolean {
  if (mode !== "edit") {
    return false;
  }

  if (section.id === "websites") {
    return true;
  }

  if (section.id === "credentials") {
    return !sectionHasTotpField(section);
  }

  return false;
}

function keySectionCanAddField(section: DemoSection, mode: KeyFormMode): boolean {
  if (mode !== "edit") {
    return false;
  }

  if (section.variant === "additional") {
    return true;
  }

  return sectionHasAddFieldButton(section, mode);
}

function surfaceRoundingForField(
  section: DemoSection,
  mode: KeyFormMode,
  fieldIndex: number,
  isFieldDragging: boolean,
) {
  return getKeyFieldSurfaceRounding({
    mode,
    sectionVariant: section.variant,
    sectionTitle: section.title,
    editableTitle: true,
    fieldIndex,
    fieldsCount: section.fields.length,
    canAddField: keySectionCanAddField(section, mode),
    isFieldDragging,
  });
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
  exhausted = false,
}: {
  value: number;
  total: number;
  tone?: "success" | "warning" | "danger";
  exhausted?: boolean;
}) {
  const totalSegments = 60;
  const safeTotal = Math.max(1, total);
  const filled = Math.min(Math.max(value, 0), safeTotal);
  const filledRatio = filled / safeTotal;
  const filledSegments = Math.round(filledRatio * totalSegments);
  const degrees = exhausted ? 360 : (filledSegments / totalSegments) * 360;
  const colorByTone = {
    success: "#65A30D",
    warning: "#D97706",
    danger: "#DC2626",
  };
  const color = exhausted ? colorByTone.danger : colorByTone[tone];

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
      {exhausted ? (
        <>
          <path d="M8 4.66667V8" stroke="white" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 10.6667H8.00667" stroke="white" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : filled >= safeTotal ? (
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
  pieValue,
  total,
  tone = "success",
  exhausted = false,
}: {
  children: ReactNode;
  className?: string;
  sectionVariant: DemoSectionVariant;
  value: number;
  pieValue?: number;
  total: number;
  tone?: "success" | "warning" | "danger";
  exhausted?: boolean;
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
      <PieIndicator value={pieValue ?? value} total={total} tone={tone} exhausted={exhausted} />
    </span>
  );
}

type PasswordStrength = {
  labelKey: PasswordStrengthLabelKey;
  value: number;
  tone: "success" | "warning" | "danger";
  entropyBits: number;
};

const passwordStrengthTextClassName: Record<PasswordStrengthLabelKey, string> = {
  weak: "text-destructive",
  fair: "text-amber-600",
  good: "text-amber-600",
  strong: "text-lime-600",
  excellent: "text-lime-700",
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
    return { labelKey: "weak", value, tone: "danger", entropyBits };
  }
  if (entropyBits < 50) {
    return { labelKey: "fair", value, tone: "warning", entropyBits };
  }
  if (entropyBits < 64) {
    return { labelKey: "good", value, tone: "warning", entropyBits };
  }
  if (entropyBits < 80) {
    return { labelKey: "strong", value, tone: "success", entropyBits };
  }
  return { labelKey: "excellent", value, tone: "success", entropyBits };
}

function estimatePasswordCrackTimeKey(password: string): CrackTimeLabelKey {
  if (!password) {
    return "instantly";
  }

  const entropyBits = getPasswordEntropyBits(password);
  if (entropyBits < 28) return "instantly";
  if (entropyBits < 36) return "hours";
  if (entropyBits < 44) return "days";
  if (entropyBits < 52) return "months";
  if (entropyBits < 60) return "years";
  if (entropyBits < 72) return "decades";
  if (entropyBits < 84) return "centuries";
  return "forever";
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

function metaForField(
  type: string,
  sectionVariant: DemoSectionVariant,
  messages: KeyFormEditorMessages,
  value?: ReactNode,
  mode: KeyFormMode = "view",
): ReactNode {
  const counterClassName = mode === "edit" ? "mr-2" : undefined;

  if (type === "password") {
    const strength = typeof value === "string" ? getPasswordStrength(value) : null;
    if (!strength) {
      return null;
    }

    return (
      <KeyCounter className={counterClassName} sectionVariant={sectionVariant} value={strength.value} total={10} tone={strength.tone}>
        {messages.passwordStrengthLabels[strength.labelKey]}
      </KeyCounter>
    );
  }
  if (type === "recovery-codes" && typeof value === "string") {
    const codes = parseKeyFieldRecoveryCodesValue(value);
    const usedCount = getKeyFieldRecoveryCodesUsedCount(codes);
    const remainingCount = getKeyFieldRecoveryCodesRemainingCount(codes);
    const total = codes.length;
    if (total === 0) {
      return null;
    }

    const allUsed = remainingCount === 0;

    return (
      <KeyCounter
        className={counterClassName}
        sectionVariant={sectionVariant}
        value={usedCount}
        pieValue={remainingCount}
        total={total}
        tone={allUsed ? "danger" : remainingCount <= total / 2 ? "warning" : "success"}
        exhausted={allUsed}
      >
        {formatKeyFormMessage(messages.recoveryCodesCounter, { used: usedCount, total })}
      </KeyCounter>
    );
  }
  return null;
}

function metaForSecretLikeField(
  field: DemoField,
  sectionVariant: DemoSectionVariant,
  messages: KeyFormEditorMessages,
  value?: ReactNode,
  mode: KeyFormMode = "view",
): ReactNode {
  if (!secretFieldShowsStrength(field)) {
    return null;
  }
  return metaForField("password", sectionVariant, messages, value, mode);
}

function secretVisibilityLabels(
  field: DemoField,
  isVisible: boolean,
  messages: KeyFormEditorMessages,
): { show: string; hide: string } {
  if (showSecretLabelKey(field) === "password") {
    return { show: messages.showPassword, hide: messages.hidePassword };
  }
  return { show: messages.showSecret, hide: messages.hideSecret };
}

function secretKindLabel(kind: KeyFieldSecretKind, messages: KeyFormEditorMessages): string {
  if (kind === "password") {
    return messages.secretKind.password;
  }
  if (kind === "single-line") {
    return messages.secretKind.singleLine;
  }
  return messages.secretKind.multiLine;
}

function generatePassword(settings: PasswordGeneratorSettings, length: number): string {
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

function TotpFieldDisplay({
  secret,
  sectionVariant,
}: {
  secret: string;
  sectionVariant: DemoSectionVariant;
}) {
  const [timestamp, setTimestamp] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setTimestamp(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const tokenState = getTotpTokenState(secret, timestamp);
  if (!tokenState) {
    return null;
  }

  const timerTone =
    tokenState.remainingSeconds <= 2 ? "danger" : tokenState.remainingSeconds <= 5 ? "warning" : "success";

  return (
    <span className="inline-flex items-center gap-2">
      {renderTotpToken(tokenState.token)}
      <KeyCounter
        className="font-mono tabular-nums"
        sectionVariant={sectionVariant}
        value={tokenState.remainingSeconds}
        total={tokenState.period}
        tone={timerTone}
      >
        {tokenState.remainingSeconds}
      </KeyCounter>
    </span>
  );
}

function normalizePhoneValue(value: string): string {
  const hasLeadingPlus = value.trimStart().startsWith("+");
  const digits = value.replace(/\D/g, "");
  return `${hasLeadingPlus ? "+" : ""}${digits}`;
}

const knownCallingCodes = [
  "1",
  "7",
  "8",
  "20",
  "27",
  "30",
  "31",
  "32",
  "33",
  "34",
  "36",
  "39",
  "40",
  "41",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "52",
  "55",
  "61",
  "64",
  "65",
  "81",
  "82",
  "84",
  "86",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "98",
  "212",
  "213",
  "216",
  "218",
  "220",
  "221",
  "222",
  "223",
  "224",
  "225",
  "226",
  "227",
  "228",
  "229",
  "230",
  "231",
  "232",
  "233",
  "234",
  "235",
  "236",
  "237",
  "238",
  "239",
  "240",
  "241",
  "242",
  "243",
  "244",
  "245",
  "246",
  "248",
  "249",
  "250",
  "251",
  "252",
  "253",
  "254",
  "255",
  "256",
  "257",
  "258",
  "260",
  "261",
  "262",
  "263",
  "264",
  "265",
  "266",
  "267",
  "268",
  "269",
  "290",
  "291",
  "297",
  "298",
  "299",
  "350",
  "351",
  "352",
  "353",
  "354",
  "355",
  "356",
  "357",
  "358",
  "359",
  "370",
  "371",
  "372",
  "373",
  "374",
  "375",
  "376",
  "377",
  "378",
  "380",
  "381",
  "382",
  "383",
  "385",
  "386",
  "387",
  "389",
  "420",
  "421",
  "423",
  "500",
  "501",
  "502",
  "503",
  "504",
  "505",
  "506",
  "507",
  "508",
  "509",
  "590",
  "591",
  "592",
  "593",
  "594",
  "595",
  "596",
  "597",
  "598",
  "599",
  "670",
  "672",
  "673",
  "674",
  "675",
  "676",
  "677",
  "678",
  "679",
  "680",
  "681",
  "682",
  "683",
  "685",
  "686",
  "687",
  "688",
  "689",
  "690",
  "691",
  "692",
  "850",
  "852",
  "853",
  "855",
  "856",
  "880",
  "886",
  "960",
  "961",
  "962",
  "963",
  "964",
  "965",
  "966",
  "967",
  "968",
  "970",
  "971",
  "972",
  "973",
  "974",
  "975",
  "976",
  "977",
  "992",
  "993",
  "994",
  "995",
  "996",
  "998",
].sort((a, b) => b.length - a.length);

function getPhoneCountryCode(digits: string): string {
  return knownCallingCodes.find((code) => digits.startsWith(code)) ?? digits.slice(0, Math.min(3, digits.length));
}

function removePhoneDigitAtIndex(value: string, digitIndex: number): string {
  const normalizedValue = normalizePhoneValue(value);
  const hasPlus = normalizedValue.startsWith("+");
  const digits = hasPlus ? normalizedValue.slice(1) : normalizedValue;
  if (!digits) {
    return normalizedValue;
  }

  const safeDigitIndex = Math.max(0, Math.min(digitIndex, digits.length - 1));
  return `${hasPlus ? "+" : ""}${digits.slice(0, safeDigitIndex)}${digits.slice(safeDigitIndex + 1)}`;
}

function formatPhoneValue(value: string): string {
  const normalizedValue = normalizePhoneValue(value);
  const hasPlus = normalizedValue.startsWith("+");
  const digits = hasPlus ? normalizedValue.slice(1) : normalizedValue;
  if (!digits) {
    return hasPlus ? "+" : "";
  }

  const countryCode = getPhoneCountryCode(digits);
  const nationalNumber = digits.slice(countryCode.length);
  const prefix = `${hasPlus ? "+" : ""}${countryCode}`;

  if (countryCode === "1") {
    const area = nationalNumber.slice(0, 3);
    const exchange = nationalNumber.slice(3, 6);
    const subscriber = nationalNumber.slice(6, 10);
    const rest = nationalNumber.slice(10);
    const areaPart = area ? `(${area}${area.length === 3 ? ")" : ""}` : "";
    const localPart = [exchange, subscriber ? `-${subscriber}` : ""].join("");
    const parts = [areaPart, localPart, rest].filter(Boolean);

    return `${prefix}${parts.length > 0 ? " " : ""}${parts.join(" ")}`.trimEnd();
  }

  const area = nationalNumber.slice(0, 3);
  const first = nationalNumber.slice(3, 6);
  const second = nationalNumber.slice(6, 8);
  const third = nationalNumber.slice(8, 10);
  const rest = nationalNumber.slice(10);
  const areaPart = area ? `(${area}${area.length === 3 ? ")" : ""}` : "";
  const localPart = [first, second ? `-${second}` : "", third ? `-${third}` : ""].join("");
  const parts = [areaPart, localPart, rest].filter(Boolean);

  return `${prefix}${parts.length > 0 ? " " : ""}${parts.join(" ")}`.trimEnd();
}

function formatMaskedPhoneInput(value: string, context: KeyFieldValueTransformContext): string {
  const normalizedValue = normalizePhoneValue(value);
  const previousNormalizedValue = normalizePhoneValue(context.previousValue);
  if (
    context.inputType?.startsWith("delete") &&
    normalizedValue === previousNormalizedValue &&
    value.length < context.previousValue.length
  ) {
    const valueBeforeCursor = value.slice(0, context.selectionStart ?? value.length);
    const digitsBeforeCursor = valueBeforeCursor.replace(/\D/g, "").length;
    return formatPhoneValue(removePhoneDigitAtIndex(previousNormalizedValue, digitsBeforeCursor - 1));
  }

  return formatPhoneValue(value);
}

type SortableFieldProps = {
  section: DemoSection;
  field: DemoField;
  value: ReactNode;
  mode: KeyFormMode;
  reorderable: boolean;
  autoFocusValue?: boolean;
  autoFocusValueRequest?: number;
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
  transformValueInput?: (value: string, context: KeyFieldValueTransformContext) => string;
  dateValue?: boolean;
  addressValue?: boolean;
  recoveryCodesValue?: boolean;
  recoveryCodesRevealed?: boolean;
  fileValue?: boolean;
  onFileUpload?: (file: File, onProgress: (percent: number) => void) => Promise<KeyFieldFileValue>;
  onFileDelete?: (file: KeyFieldFileValue) => Promise<void>;
  statusOverlayLabel?: string;
  onCopyAction?: (value: string) => void | Promise<void>;
  onValueBlur?: () => void;
  onValueFocus?: () => void;
  passwordGeneratorTrigger?: boolean;
  messages: KeyFormEditorMessages;
  addressFieldPlaceholders?: KeyFormEditorMessages["address"];
  recoveryCodesPlaceholder?: string;
  fileUploadLabel?: string;
  fileClearLabel?: string;
  surfaceRounding?: ReturnType<typeof getKeyFieldSurfaceRounding>;
};

function SortableField({
  section,
  field,
  value,
  mode,
  reorderable,
  autoFocusValue,
  autoFocusValueRequest,
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
  transformValueInput,
  dateValue,
  addressValue,
  recoveryCodesValue,
  recoveryCodesRevealed,
  fileValue,
  onFileUpload,
  onFileDelete,
  statusOverlayLabel,
  onCopyAction,
  onValueBlur,
  onValueFocus,
  passwordGeneratorTrigger,
  messages,
  addressFieldPlaceholders,
  recoveryCodesPlaceholder,
  fileUploadLabel,
  fileClearLabel,
  surfaceRounding,
}: SortableFieldProps) {
  const secretKind = getSecretKind(field);
  const isMultiLineSecret = field.type === "secret" && secretKind === "multi-line";
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
    <div ref={setNodeRef} style={style} className={cn("min-w-0", isDragging && "relative z-10 opacity-0")}>
      <KeyField
      label={fieldDisplayLabel(field, messages)}
      surfaceRounding={surfaceRounding}
      value={value}
      mode={mode}
      editableLabel={field.editableLabel}
      editableValue={typeof value === "string"}
      multilineValue={field.type === "multiline-text" || isMultiLineSecret}
      secretMultilineValue={isMultiLineSecret}
      dateValue={dateValue}
      addressValue={addressValue}
      recoveryCodesValue={recoveryCodesValue}
      recoveryCodesRevealed={recoveryCodesRevealed}
      fileValue={fileValue}
      onFileUpload={onFileUpload}
      onFileDelete={onFileDelete}
      autoFocusValue={autoFocusValue}
      autoFocusValueRequest={autoFocusValueRequest}
      reorderable={reorderable}
      meta={
        field.type === "recovery-codes" || field.type === "totp" || field.type === "file" || isSecretLikeField(field)
          ? null
          : metaForField(field.type, section.variant, messages, typeof value === "string" ? value : undefined, mode)
      }
      actions={actions}
      floatingActions={floatingActions}
      isHoverLocked={isHoverLocked}
      forceActive={forceActive}
      isInvalid={isInvalid}
      fieldOverlay={fieldOverlay}
      concealValue={concealValue}
      transformValueInput={transformValueInput}
      className={cn(
        section.variant === "primary" && "border-x-transparent",
        section.variant === "additional" &&
          keyFormAdditionalFieldBorderClassName({
            isFirst: section.fields[0]?.id === field.id,
            isLast: section.fields[section.fields.length - 1]?.id === field.id,
            showTrailingBottomBorder: showBottomBorder,
          }),
        section.variant === "primary" && hideTopBorder && "border-t-transparent",
        section.variant === "primary" && hideTopBorder && "!mt-0",
        section.variant === "primary" && hideBottomBorder && "border-b-transparent",
      )}
      valueClassName={
        field.type === "multiline-text" ||
        field.type === "note" ||
        field.type === "address" ||
        field.type === "recovery-codes" ||
        isMultiLineSecret
          ? "whitespace-pre-wrap break-words"
          : undefined
      }
      controlButtonClassName={section.variant === "additional" ? "hover:!bg-card" : undefined}
      copyValue={copyValue ?? field.copyValue}
      copyLabel={copyLabel ?? messages.copy}
      copySuccessLabel={copySuccessLabel ?? messages.copied}
      statusOverlayLabel={statusOverlayLabel}
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
      onValueBlur={onValueBlur}
      onValueFocus={onValueFocus}
      passwordGeneratorTrigger={passwordGeneratorTrigger}
      addressFieldPlaceholders={addressFieldPlaceholders ?? messages.address}
      addressSearchCountriesPlaceholder={(addressFieldPlaceholders ?? messages.address).searchCountries}
      addressNoCountriesFoundMessage={(addressFieldPlaceholders ?? messages.address).noCountriesFound}
      recoveryCodesPlaceholder={recoveryCodesPlaceholder ?? messages.recoveryCodesPlaceholder}
      fileUploadLabel={fileUploadLabel ?? messages.file.upload}
      fileClearLabel={fileClearLabel ?? messages.file.clear}
      valuePlaceholder={messages.fieldPlaceholders[fieldValuePlaceholderKey(field)]}
      dragHandleProps={mode === "edit" && reorderable ? { ...attributes, ...listeners } : undefined}
    />
    </div>
  );
}

type SortableSectionProps = {
  section: DemoSection;
  mode: KeyFormMode;
  fieldTypes: readonly KeyFieldTypeOption[];
  addFieldLabel: string;
  sectionTitlePlaceholder: string;
  editSectionTitleAriaLabel: string;
  onAddField?: (type: KeyFieldTypeOption) => void;
  onTitleChange: (title: string) => void;
  children: ReactNode;
};

function SortableSection({
  section,
  mode,
  fieldTypes,
  addFieldLabel,
  sectionTitlePlaceholder,
  editSectionTitleAriaLabel,
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
    <div ref={setNodeRef} style={style} className={cn(isDragging && "relative z-10 opacity-0")}>
      <KeySection
        title={section.title}
        variant={section.variant}
        mode={mode}
        editableTitle
        reorderable
        fieldTypes={fieldTypes}
        addFieldLabel={addFieldLabel}
        sectionTitlePlaceholder={sectionTitlePlaceholder}
        editSectionTitleAriaLabel={editSectionTitleAriaLabel}
        onAddField={onAddField}
        onTitleChange={onTitleChange}
        dragHandleProps={mode === "edit" && section.variant === "additional" ? { ...attributes, ...listeners } : undefined}
      >
      {children}
    </KeySection>
    </div>
  );
}

export function KeyFormEditor({
  initialSections = [],
  mode = "edit",
  addSectionLabel = "Add section with field",
  addFieldLabel = "Add field",
  fieldTypes: fieldTypesProp,
  messages: messagesProp,
  className,
  onSectionsChange,
  onWebsiteUrlsBlur,
  onRecoveryCodesValueChange,
  showValidation = false,
}: KeyFormEditorProps) {
  const messages = messagesProp ?? englishKeyFormEditorMessages;
  const fieldTypes = fieldTypesProp ?? englishKeyFieldTypes;
  const [sections, setSections] = useState<DemoSection[]>(() => [...initialSections]);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  useEffect(() => {
    onSectionsChange?.(sections);
  }, [sections, onSectionsChange]);

  const notifyWebsiteUrlsBlur = useCallback(() => {
    onWebsiteUrlsBlur?.(sectionsRef.current);
  }, [onWebsiteUrlsBlur]);

  const websitesUrlFieldOrderKey = useMemo(() => {
    const websitesSection = sections.find((section) => section.id === "websites");
    if (!websitesSection) {
      return "";
    }
    return websitesSection.fields
      .filter((field) => field.type === "url")
      .map((field) => field.id)
      .join("\u0001");
  }, [sections]);
  const prevWebsiteUrlFieldOrderKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const nextKey = websitesUrlFieldOrderKey;
    const prevKey = prevWebsiteUrlFieldOrderKeyRef.current;

    if (prevKey === null) {
      prevWebsiteUrlFieldOrderKeyRef.current = nextKey;
      return;
    }

    prevWebsiteUrlFieldOrderKeyRef.current = nextKey;

    const prevIds = prevKey ? prevKey.split("\u0001") : [];
    const nextIds = nextKey ? nextKey.split("\u0001") : [];
    const isReorder =
      prevIds.length === nextIds.length &&
      prevIds.length > 0 &&
      prevIds.some((id, index) => id !== nextIds[index]);

    if (isReorder) {
      onWebsiteUrlsBlur?.(sections);
    }
  }, [websitesUrlFieldOrderKey, sections, onWebsiteUrlsBlur]);

  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<ReadonlySet<string>>(() => new Set());
  const [visibleRecoveryCodesIds, setVisibleRecoveryCodesIds] = useState<ReadonlySet<string>>(() => new Set());
  const [unmaskedPhoneIds, setUnmaskedPhoneIds] = useState<ReadonlySet<string>>(() => new Set());
  const [disabledMultilineCopyIds, setDisabledMultilineCopyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [openFieldMenuId, setOpenFieldMenuId] = useState<string | null>(null);
  const [activeValueFieldId, setActiveValueFieldId] = useState<string | null>(null);
  const [valueFocusRequest, setValueFocusRequest] = useState(0);
  const [passwordGeneratorFieldId, setPasswordGeneratorFieldId] = useState<string | null>(null);
  const [passwordGeneratorPreferences, setPasswordGeneratorPreferences] = useState<PasswordGeneratorPreferences>(
    loadPasswordGeneratorPreferences,
  );
  const { length: passwordGeneratorLength, ...passwordGeneratorSettings } = passwordGeneratorPreferences;
  const [generatedPassword, setGeneratedPassword] = useState(() =>
    generatePassword(passwordGeneratorSettings, passwordGeneratorLength),
  );
  const [isGeneratedPasswordCopied, setIsGeneratedPasswordCopied] = useState(false);
  const nextIdRef = useRef(getNextFormEntityCounter(initialSections));
  const pendingSecretKindFocusFieldIdRef = useRef<string | null>(null);
  const generatedPasswordCopyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlFieldTypes = useMemo(() => fieldTypes.filter((type) => type.id === "url"), [fieldTypes]);
  const totpFieldTypes = useMemo(() => fieldTypes.filter((type) => type.id === "totp"), [fieldTypes]);
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

  const handleKeyFieldFileUpload = useCallback(
    (file: File, onProgress: (percent: number) => void) => uploadDevKeyFieldFile(file, onProgress),
    [],
  );

  useEffect(() => {
    window.localStorage.setItem(passwordGeneratorStorageKey, JSON.stringify(passwordGeneratorPreferences));
  }, [passwordGeneratorPreferences]);

  const previousModeRef = useRef<KeyFormMode>(mode);

  useEffect(() => {
    if (mode === "edit" && previousModeRef.current !== "edit") {
      setVisibleRecoveryCodesIds(new Set());
    }

    previousModeRef.current = mode;
  }, [mode]);

  useEffect(
    () => () => {
      if (generatedPasswordCopyResetTimeoutRef.current) {
        clearTimeout(generatedPasswordCopyResetTimeoutRef.current);
      }
    },
    [],
  );

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

  function focusFieldValue(fieldId: string) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setActiveValueFieldId(fieldId);
        setValueFocusRequest((current) => current + 1);
      });
    });
  }

  function flushPendingSecretKindFocus() {
    const fieldId = pendingSecretKindFocusFieldIdRef.current;
    pendingSecretKindFocusFieldIdRef.current = null;
    if (fieldId) {
      focusFieldValue(fieldId);
    }
  }

  function createField(type: KeyFieldTypeOption): DemoField {
    const id = `field-${nextIdRef.current++}`;
    const initialValue =
      type.id === "address"
        ? serializeKeyFieldAddressValue(emptyKeyFieldAddressValue())
        : type.id === "recovery-codes"
          ? serializeKeyFieldRecoveryCodesValue(emptyKeyFieldRecoveryCodesValue())
          : "";
    return {
      id,
      type: type.id,
      label: messages.fieldLabels[type.id] ?? type.label.toLowerCase(),
      value: initialValue,
      copyValue: "",
      editableLabel: true,
      secret: type.id === "secret",
      ...(type.id === "secret" ? { secretKind: "password" as const } : {}),
    };
  }

  function addSection(type: KeyFieldTypeOption) {
    const sectionId = `section-${nextIdRef.current++}`;
    const field = createField(type);
    setSections((current) => [
      ...current,
      {
        id: sectionId,
        variant: "additional",
        title: "",
        fields: [field],
      },
    ]);
    focusFieldValue(field.id);
  }

  function addField(sectionId: string, type: KeyFieldTypeOption) {
    let field = createField(type);

    if (sectionId === "credentials" && type.id === "totp") {
      field = {
        ...field,
        editableLabel: false,
        deletable: true,
      };
    }

    if (sectionId === "websites" && type.id === "url") {
      field = {
        ...field,
        editableLabel: true,
        deletable: true,
        urlAutofillScope: "entire-site",
      };
    }

    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, fields: [...section.fields, field] } : section,
      ),
    );
    focusFieldValue(field.id);
  }

  function updateUrlAutofillScope(sectionId: string, fieldId: string, scope: KeyFormUrlAutofillScope) {
    setOpenFieldMenuId(null);
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.map((field) =>
                field.id === fieldId ? { ...field, urlAutofillScope: scope } : field,
              ),
            }
          : section,
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

    const targetField = sections
      .find((section) => section.id === sectionId)
      ?.fields.find((field) => field.id === fieldId);

    function updateField(field: DemoField): DemoField {
      if (field.id !== fieldId) {
        return field;
      }

      const isPhoneMaskEnabled = field.type === "phone" && !unmaskedPhoneIds.has(field.id);
      const nextValue = isPhoneMaskEnabled ? normalizePhoneValue(value) : value;
      return {
        ...field,
        value: nextValue,
        copyValue:
          isSecretLikeField(field)
            ? value
            : field.type === "phone"
              ? nextValue
              : field.secret
                ? field.copyValue
                : value,
      };
    }

    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.map(updateField),
            }
          : section,
      ),
    );

    if (targetField && isFixedPasswordField(targetField)) {
      syncPasswordGeneratorForPasswordValue(fieldId, value);
    }
  }

  function updateSecretKind(sectionId: string, fieldId: string, secretKind: KeyFieldSecretKind) {
    setOpenFieldMenuId(null);
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.map((field) =>
                field.id === fieldId && field.type === "secret" ? { ...field, secretKind } : field,
              ),
            }
          : section,
      ),
    );
    pendingSecretKindFocusFieldIdRef.current = fieldId;
  }

  function removeField(sectionId: string, fieldId: string) {
    let nextSections: DemoSection[] | null = null;
    let shouldSyncWebsiteUrls = false;

    setSections((current) => {
      const section = current.find((item) => item.id === sectionId);
      const field = section?.fields.find((item) => item.id === fieldId);
      shouldSyncWebsiteUrls = Boolean(
        section &&
          field &&
          section.id === "websites" &&
          field.type === "url" &&
          canDeleteField(section, field),
      );

      nextSections = current
        .map((item) => {
          if (item.id !== sectionId) {
            return item;
          }

          if (!field || !canDeleteField(item, field)) {
            return item;
          }

          return { ...item, fields: item.fields.filter((entry) => entry.id !== fieldId) };
        })
        .filter((item) => item.fields.length > 0);

      return nextSections;
    });

    if (shouldSyncWebsiteUrls && nextSections) {
      onWebsiteUrlsBlur?.(nextSections);
    }
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

  function syncPasswordGeneratorForPasswordValue(fieldId: string, value: string) {
    if (value.trim().length > 0) {
      setPasswordGeneratorFieldId((current) => (current === fieldId ? null : current));
      return;
    }
    openPasswordGenerator(fieldId);
  }

  function renderPasswordGeneratorPanel(section: DemoSection, field: DemoField) {
    if (passwordGeneratorFieldId !== field.id) {
      return null;
    }

    const options: Array<{ key: keyof PasswordGeneratorSettings; label: string }> = [
      { key: "uppercase", label: messages.passwordGenerator.uppercase },
      { key: "lowercase", label: messages.passwordGenerator.lowercase },
      { key: "numbers", label: messages.passwordGenerator.numbers },
      { key: "symbols", label: messages.passwordGenerator.symbols },
    ];
    const generatedStrength = getPasswordStrength(generatedPassword);
    const crackTimeKey = estimatePasswordCrackTimeKey(generatedPassword);

    return (
      <KeyFieldOverlayPanel data-password-generator-panel className="w-[420px]">
        <div className="flex flex-col gap-3">
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
                <span className="font-medium text-foreground">
                  {formatKeyFormMessage(messages.passwordGenerator.charactersTemplate, {
                    count: passwordGeneratorLength,
                  })}
                </span>
                <span className="text-xs text-muted-foreground">{messages.passwordGenerator.lengthRange}</span>
              </div>
              <Slider
                value={[passwordGeneratorLength]}
                min={4}
                max={128}
                step={1}
                onValueChange={(value) => updatePasswordGeneratorLength(value[0] ?? passwordGeneratorLength)}
                aria-label={messages.passwordGenerator.lengthAria}
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
                    aria-label={messages.passwordGenerator.copyGeneratedAria}
                    onClick={copyGeneratedPassword}
                  >
                    {isGeneratedPasswordCopied ? <CopySuccessIcon className="size-4" /> : <CopyIcon className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isGeneratedPasswordCopied ? messages.copied : messages.copy}</TooltipContent>
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
                    aria-label={messages.passwordGenerator.regenerateAria}
                    onClick={regeneratePassword}
                  >
                    <RegeneratePasswordIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{messages.passwordGenerator.regenerate}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center justify-between gap-3 px-3 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              {messages.passwordGenerator.strength}{" "}
              {generatedStrength ? (
                <span className={cn("font-medium", passwordStrengthTextClassName[generatedStrength.labelKey])}>
                  {messages.passwordStrengthLabels[generatedStrength.labelKey]}
                </span>
              ) : (
                <span className="font-medium text-muted-foreground">
                  {messages.passwordStrengthLabels.weak}
                </span>
              )}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {messages.passwordGenerator.crackTime}{" "}
              <span
                className={cn(
                  "font-medium",
                  generatedStrength
                    ? passwordStrengthTextClassName[generatedStrength.labelKey]
                    : "text-muted-foreground",
                )}
              >
                {messages.crackTimeLabels[crackTimeKey]}
              </span>
            </span>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closePasswordGenerator}>
              {messages.passwordGenerator.cancel}
            </Button>
            <Button type="button" onClick={() => insertGeneratedPassword(section.id, field.id)}>
              {messages.passwordGenerator.insert}
            </Button>
          </div>
        </div>
      </KeyFieldOverlayPanel>
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
    const isSecretVisible = isSecretLikeField(field) && visiblePasswordIds.has(field.id);
    const isRecoveryCodesRevealed = field.type === "recovery-codes" && visibleRecoveryCodesIds.has(field.id);
    const isFieldMenuOpen = openFieldMenuId === field.id;
    const isPasswordGeneratorOpen = passwordGeneratorFieldId === field.id;
    const fieldMeta = metaForSecretLikeField(
      field,
      section.variant,
      messages,
      typeof field.value === "string" ? field.value : undefined,
      mode,
    );
    const visibilityLabels = secretVisibilityLabels(field, isSecretVisible, messages);
    const currentSecretKind = getSecretKind(field);
    const secretKindOptions: KeyFieldSecretKind[] = ["password", "single-line", "multi-line"];

    if (!canEdit) {
      const showRecoveryCodesMeta = field.type === "recovery-codes" && !isRecoveryCodesRevealed;
      return (secretFieldShowsStrength(field) || showRecoveryCodesMeta) && fieldMeta ? (
        <span className={cn("transition-opacity group-hover/key-field:opacity-0", isFieldMenuOpen && "opacity-0")}>
          {fieldMeta}
        </span>
      ) : null;
    }

    return (
      <>
        {secretFieldShowsStrength(field) ? fieldMeta : null}
        {isFixedPasswordField(field) ? (
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
                  aria-label={formatKeyFormMessage(messages.fieldSettingsAria, { fieldLabel: field.label })}
                >
                  <GearIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-[13rem] p-1">
                <DropdownMenuItem onSelect={() => togglePasswordVisibility(field.id)}>
                  {isSecretVisible ? <HidePasswordIcon className="size-4" /> : <ShowPasswordIcon className="size-4" />}
                  {isSecretVisible ? visibilityLabels.hide : visibilityLabels.show}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openPasswordGenerator(field.id)}>
                  <GeneratePasswordIcon className="size-4" />
                  {messages.generator}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : isConfigurableSecretField(field) ? (
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
                  aria-label={formatKeyFormMessage(messages.fieldSettingsAria, { fieldLabel: field.label })}
                >
                  <GearIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="min-w-[15rem] p-1"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  flushPendingSecretKindFocus();
                }}
              >
                {secretKindOptions.map((kind) => {
                  const selected = currentSecretKind === kind;
                  return (
                    <DropdownMenuItem key={kind} onSelect={() => updateSecretKind(section.id, field.id, kind)}>
                      {selected ? <CheckIcon className="size-4" /> : <span className="size-4 shrink-0" aria-hidden />}
                      {secretKindLabel(kind, messages)}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => togglePasswordVisibility(field.id)}>
                  {isSecretVisible ? <HidePasswordIcon className="size-4" /> : <ShowPasswordIcon className="size-4" />}
                  {isSecretVisible ? visibilityLabels.hide : visibilityLabels.show}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openPasswordGenerator(field.id)}>
                  <GeneratePasswordIcon className="size-4" />
                  {messages.generator}
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
                aria-label={formatKeyFormMessage(messages.fieldSettingsAria, { fieldLabel: field.label })}
              >
                <GearIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-[13rem] p-1">
              <DropdownMenuItem onSelect={() => resetTotpSecret(section.id, field.id)}>
                <EnterTotpSecretIcon className="size-4" />
                {messages.enterNewTotpSecret}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : field.type === "url" && section.id === "websites" ? (
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
                aria-label={formatKeyFormMessage(messages.fieldSettingsAria, { fieldLabel: field.label })}
              >
                <GearIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-[15rem] p-1">
              {URL_AUTOFILL_SCOPES.map((scope) => {
                const selected = (field.urlAutofillScope ?? "entire-site") === scope;
                return (
                  <DropdownMenuItem
                    key={scope}
                    onSelect={() => updateUrlAutofillScope(section.id, field.id, scope)}
                  >
                    {selected ? <CheckIcon className="size-4" /> : <span className="size-4 shrink-0" aria-hidden />}
                    {messages.urlAutofillScope[scope]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : field.type === "phone" ? (
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
                aria-label={formatKeyFormMessage(messages.fieldSettingsAria, { fieldLabel: field.label })}
              >
                <GearIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-[13rem] p-1">
              <DropdownMenuItem onSelect={() => togglePhoneMask(field.id)}>
                {unmaskedPhoneIds.has(field.id) ? <EnableMaskIcon className="size-4" /> : <DisableMaskIcon className="size-4" />}
                {unmaskedPhoneIds.has(field.id) ? messages.enableMask : messages.disableMask}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : field.type === "multiline-text" ? (
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
                aria-label={formatKeyFormMessage(messages.fieldSettingsAria, { fieldLabel: field.label })}
              >
                <GearIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-[14rem] p-1">
              <DropdownMenuItem onSelect={() => toggleMultilineCopy(field.id)}>
                {disabledMultilineCopyIds.has(field.id) ? <EnableCopyIcon className="size-4" /> : <DisableCopyIcon className="size-4" />}
                {disabledMultilineCopyIds.has(field.id) ? messages.enableFullTextCopy : messages.disableFullTextCopy}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : field.secret ? (
          <ActionButton label={messages.showValue} sectionVariant={section.variant}>
            <EyeIcon className="size-4" />
          </ActionButton>
        ) : null}
        {canEdit && canDeleteField(section, field) ? (
          <ActionButton label={messages.deleteField} destructive sectionVariant={section.variant} onClick={() => removeField(section.id, field.id)}>
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

  function toggleRecoveryCodesVisibility(fieldId: string) {
    setVisibleRecoveryCodesIds((current) => {
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

  function togglePhoneMask(fieldId: string) {
    setUnmaskedPhoneIds((current) => {
      const next = new Set(current);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  }

  function toggleMultilineCopy(fieldId: string) {
    setDisabledMultilineCopyIds((current) => {
      const next = new Set(current);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  }

  async function copyRecoveryCode(sectionId: string, field: DemoField, copiedValue: string) {
    if (field.type !== "recovery-codes" || typeof field.value !== "string") {
      return;
    }

    const nextValue = serializeKeyFieldRecoveryCodesValue(
      markFirstUnusedKeyFieldRecoveryCodeUsed(parseKeyFieldRecoveryCodesValue(field.value)),
    );
    updateFieldValue(sectionId, field.id, nextValue);
    await navigator.clipboard.writeText(copiedValue);
    await onRecoveryCodesValueChange?.({ sectionId, fieldId: field.id, value: nextValue });
  }

  function openAddressInMaps(field: DemoField) {
    if (field.type !== "address" || typeof field.value !== "string") {
      return;
    }

    const url = buildKeyFieldAddressMapsUrl(parseKeyFieldAddressValue(field.value));
    const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (openedWindow) {
      openedWindow.opener = null;
    }
  }

  function openWebsite(value: string) {
    const openedWindow = window.open(value, "_blank", "noopener,noreferrer");
    if (openedWindow) {
      openedWindow.opener = null;
    }
  }

  function valueForField(section: DemoSection, field: DemoField): ReactNode {
    if (field.type === "phone" && typeof field.value === "string" && !unmaskedPhoneIds.has(field.id)) {
      return formatPhoneValue(field.value);
    }

    if (field.type === "totp" && typeof field.value === "string") {
      const tokenState = getTotpTokenState(field.value, Date.now());
      if (tokenState) {
        return <TotpFieldDisplay secret={field.value} sectionVariant={section.variant} />;
      }
    }

    return field.value;
  }

  function isInvalidTotpField(field: DemoField): boolean {
    return field.type === "totp" && typeof field.value === "string" && field.value.trim().length > 0 && !createTotp(field.value);
  }

  function isInvalidEmailField(field: DemoField): boolean {
    if (field.type !== "email" || typeof field.value !== "string") {
      return false;
    }

    const value = field.value.trim();
    if (!value) {
      return false;
    }

    if (value.length > 254 || /\s/.test(value)) {
      return true;
    }

    const parts = value.split("@");
    if (parts.length !== 2) {
      return true;
    }

    const [localPart, domainPart] = parts;
    if (!localPart || !domainPart || localPart.length > 64 || domainPart.length > 253) {
      return true;
    }

    if (
      localPart.startsWith(".") ||
      localPart.endsWith(".") ||
      localPart.includes("..") ||
      !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)
    ) {
      return true;
    }

    const domainLabels = domainPart.split(".");
    if (domainLabels.length < 2) {
      return true;
    }

    return domainLabels.some(
      (label, index) =>
        !label ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-") ||
        !/^[A-Za-z0-9-]+$/.test(label) ||
        (index === domainLabels.length - 1 && label.length < 2),
    );
  }

  function isInvalidDateField(field: DemoField): boolean {
    if (field.type !== "date" || typeof field.value !== "string") {
      return false;
    }

    return !isValidKeyFieldDateValue(field.value);
  }

  function isEmptyRequiredField(field: DemoField): boolean {
    if (!showValidation || !field.required) {
      return false;
    }
    if (typeof field.value !== "string") {
      return true;
    }
    return field.value.trim().length === 0;
  }

  function isInvalidField(field: DemoField): boolean {
    return (
      mode === "edit" &&
      (isEmptyRequiredField(field) || isInvalidTotpField(field) || isInvalidEmailField(field) || isInvalidDateField(field))
    );
  }

  function copyValueForField(field: DemoField): string | undefined {
    if (field.type === "totp" && typeof field.value === "string") {
      return getTotpTokenState(field.value, Date.now())?.token;
    }

    if (field.type === "phone" && typeof field.value === "string") {
      return unmaskedPhoneIds.has(field.id) ? field.value : normalizePhoneValue(field.value);
    }

    if (field.type === "address" && typeof field.value === "string") {
      return formatKeyFieldAddressCopyValue(parseKeyFieldAddressValue(field.value));
    }

    if (field.type === "recovery-codes" && typeof field.value === "string") {
      return getFirstUnusedKeyFieldRecoveryCode(parseKeyFieldRecoveryCodesValue(field.value));
    }

    return field.copyValue;
  }

  function renderFloatingActions(field: DemoField) {
    if (
      mode !== "view" ||
      (!isSecretLikeField(field) && field.type !== "url" && field.type !== "address" && field.type !== "recovery-codes")
    ) {
      return null;
    }

    const isSecretVisible = visiblePasswordIds.has(field.id);
    const visibilityLabels = secretVisibilityLabels(field, isSecretVisible, messages);
    const isRecoveryCodesVisible = visibleRecoveryCodesIds.has(field.id);
    const isOpen = openFieldMenuId === field.id;

    return (
      <DropdownMenu open={isOpen} onOpenChange={(open) => setOpenFieldMenuId(open ? field.id : null)}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="iconSm"
            aria-label={formatKeyFormMessage(messages.fieldSettingsAria, { fieldLabel: field.label })}
          >
            <SettingsIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-[11rem] p-1">
          {isSecretLikeField(field) ? (
            <DropdownMenuItem onSelect={() => togglePasswordVisibility(field.id)}>
              {isSecretVisible ? <HidePasswordIcon className="size-4" /> : <ShowPasswordIcon className="size-4" />}
              {isSecretVisible ? visibilityLabels.hide : visibilityLabels.show}
            </DropdownMenuItem>
          ) : field.type === "url" ? (
            <DropdownMenuItem onSelect={() => field.copyValue && navigator.clipboard.writeText(field.copyValue)}>
              <CopyIcon className="size-4" />
              {messages.copy}
            </DropdownMenuItem>
          ) : field.type === "address" ? (
            <DropdownMenuItem onSelect={() => openAddressInMaps(field)}>
              <OpenMapIcon className="size-4" />
              {messages.openMap}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => toggleRecoveryCodesVisibility(field.id)}>
              {isRecoveryCodesVisible ? <HidePasswordIcon className="size-4" /> : <ShowPasswordIcon className="size-4" />}
              {isRecoveryCodesVisible ? messages.hideCodes : messages.showCodes}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderField(section: DemoSection, field: DemoField) {
    const canReorderField = section.id === "websites" || !(section.variant === "primary" && !section.title);
    const isWebsiteField = field.type === "url";
    const isWebsitesSectionUrlField = section.id === "websites" && isWebsiteField;
    const isPasswordGeneratorOpen = passwordGeneratorFieldId === field.id;
    const isSecretVisible = visiblePasswordIds.has(field.id);
    const isFieldInvalid = isInvalidField(field);
    const isFieldDraggingInSection = activeDrag?.type === "field" && activeDrag.sectionId === section.id;
    const isFirstField = section.fields[0]?.id === field.id;
    const isLastField = section.fields[section.fields.length - 1]?.id === field.id;
    const hasAddFieldButton = keySectionCanAddField(section, mode);
    const fieldIndex = section.fields.findIndex((item) => item.id === field.id);
    const isPhoneMaskEnabled = field.type === "phone" && !unmaskedPhoneIds.has(field.id);
    const isMultilineCopyDisabled = field.type === "multiline-text" && disabledMultilineCopyIds.has(field.id);
    const isRecoveryCodesField = field.type === "recovery-codes";
    const isFileField = field.type === "file";
    const isRecoveryCodesRevealed = isRecoveryCodesField && visibleRecoveryCodesIds.has(field.id);
    const isRecoveryCodesExhausted =
      isRecoveryCodesField &&
      !isRecoveryCodesRevealed &&
      typeof field.value === "string" &&
      (() => {
        const codes = parseKeyFieldRecoveryCodesValue(field.value);
        return codes.length > 0 && getKeyFieldRecoveryCodesRemainingCount(codes) === 0;
      })();

    return (
      <SortableField
        key={field.id}
        section={section}
        field={field}
        surfaceRounding={surfaceRoundingForField(section, mode, fieldIndex, isFieldDraggingInSection)}
        value={valueForField(section, field)}
        mode={mode}
        reorderable={canReorderField}
        autoFocusValue={activeValueFieldId === field.id}
        autoFocusValueRequest={activeValueFieldId === field.id ? valueFocusRequest : undefined}
        actions={renderActions(section, field)}
        floatingActions={renderFloatingActions(field)}
        isHoverLocked={openFieldMenuId === field.id}
        forceActive={isPasswordGeneratorOpen}
        isInvalid={isFieldInvalid}
        fieldOverlay={isSecretLikeField(field) ? renderPasswordGeneratorPanel(section, field) : undefined}
        showBottomBorder={section.variant === "additional" && activeDrag?.type === "field"}
        hideTopBorder={section.variant === "primary" && !section.title && isFirstField && !isFieldDraggingInSection}
        hideBottomBorder={section.variant === "primary" && isLastField && !hasAddFieldButton}
        copyValue={isMultilineCopyDisabled || isRecoveryCodesRevealed || isRecoveryCodesExhausted || isFileField ? "" : copyValueForField(field)}
        copyLabel={isWebsiteField ? messages.openWebsite : undefined}
        copySuccessLabel={isWebsiteField ? null : undefined}
        statusOverlayLabel={isRecoveryCodesExhausted ? messages.allCodesUsed : undefined}
        messages={messages}
        concealValue={shouldConcealSecretField(field, isSecretVisible, isPasswordGeneratorOpen)}
        dateValue={field.type === "date"}
        addressValue={field.type === "address"}
        recoveryCodesValue={isRecoveryCodesField}
        recoveryCodesRevealed={isRecoveryCodesRevealed}
        fileValue={isFileField}
        onFileUpload={handleKeyFieldFileUpload}
        transformValueInput={isPhoneMaskEnabled ? formatMaskedPhoneInput : undefined}
        onCopyAction={
          isRecoveryCodesField
            ? (value) => copyRecoveryCode(section.id, field, value)
            : isWebsiteField
              ? openWebsite
              : undefined
        }
        onLabelChange={(label) => updateFieldLabel(section.id, field.id, label)}
        onValueChange={(value) => updateFieldValue(section.id, field.id, value)}
        onValueBlur={isWebsitesSectionUrlField ? notifyWebsiteUrlsBlur : undefined}
        onValueFocus={shouldOpenGeneratorOnFocus(field) ? () => openPasswordGenerator(field.id) : undefined}
        passwordGeneratorTrigger={isSecretLikeField(field)}
      />
    );
  }

  function renderFieldPreview(section: DemoSection, field: DemoField, isDraggedField = false, fieldIndex = 0) {
    const fieldValue = valueForField(section, field);
    const isWebsiteField = field.type === "url";
    const isRecoveryCodesField = field.type === "recovery-codes";
    const isRecoveryCodesRevealed = isRecoveryCodesField && visibleRecoveryCodesIds.has(field.id);
    const isMultiLineSecret = field.type === "secret" && getSecretKind(field) === "multi-line";
    const isSecretVisible = visiblePasswordIds.has(field.id);

    return (
      <KeyField
        label={field.label}
        surfaceRounding={
          isDraggedField
            ? undefined
            : surfaceRoundingForField(section, mode, fieldIndex, false)
        }
        value={fieldValue}
        mode={mode}
        editableLabel={field.editableLabel}
        editableValue={typeof fieldValue === "string"}
        multilineValue={field.type === "multiline-text" || isMultiLineSecret}
        secretMultilineValue={isMultiLineSecret}
        dateValue={field.type === "date"}
        addressValue={field.type === "address"}
        recoveryCodesValue={isRecoveryCodesField}
        recoveryCodesRevealed={isRecoveryCodesRevealed}
        fileValue={field.type === "file"}
        onFileUpload={handleKeyFieldFileUpload}
        addressFieldPlaceholders={messages.address}
        addressSearchCountriesPlaceholder={messages.address.searchCountries}
        addressNoCountriesFoundMessage={messages.address.noCountriesFound}
        recoveryCodesPlaceholder={messages.recoveryCodesPlaceholder}
        fileUploadLabel={messages.file.upload}
        fileClearLabel={messages.file.clear}
        valuePlaceholder={messages.fieldPlaceholders[fieldValuePlaceholderKey(field)]}
        reorderable
        meta={
          field.type === "recovery-codes" || field.type === "totp" || field.type === "file" || isSecretLikeField(field)
            ? null
            : metaForField(field.type, section.variant, messages, typeof fieldValue === "string" ? fieldValue : undefined, mode)
        }
        actions={renderActions(section, field)}
        isInvalid={isInvalidField(field)}
        concealValue={shouldConcealSecretField(field, isSecretVisible, false)}
        className={cn(
          !isDraggedField && section.variant === "primary" && "border-x-transparent",
          !isDraggedField &&
            section.variant === "additional" &&
            keyFormAdditionalFieldBorderClassName({
              isFirst: fieldIndex === 0,
              isLast: fieldIndex === section.fields.length - 1,
            }),
          isDraggedField &&
            cn(
              "rounded-lg border border-x-border border-y-border shadow-lg",
              section.variant === "additional" ? "bg-secondary" : "bg-card",
            ),
        )}
        style={isDraggedField && activeDrag?.type === "field" && activeDrag.width ? { width: activeDrag.width } : undefined}
        valueClassName={
          field.type === "multiline-text" ||
          field.type === "note" ||
          field.type === "address" ||
          field.type === "recovery-codes" ||
          isMultiLineSecret
            ? "whitespace-pre-wrap break-words"
            : undefined
        }
        controlButtonClassName={section.variant === "additional" ? "hover:!bg-card" : undefined}
        copyValue={field.copyValue}
        copyLabel={isWebsiteField ? messages.openWebsite : undefined}
        copySuccessLabel={isWebsiteField ? null : undefined}
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
          fieldTypes={section.id === "websites" ? urlFieldTypes : fieldTypes}
          addFieldLabel={section.id === "websites" ? messages.addUrl : addFieldLabel}
          sectionTitlePlaceholder={messages.sectionTitlePlaceholder}
          editSectionTitleAriaLabel={messages.editSectionTitleAria}
          onAddField={() => undefined}
          className="rounded-xl shadow-lg"
          style={activeDrag.width ? { width: activeDrag.width } : undefined}
        >
          {section.fields.map((field, fieldIndex) => renderFieldPreview(section, field, false, fieldIndex))}
        </KeySection>
      );
    }

    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <KeyForm
        mode={mode}
        addSectionLabel={addSectionLabel}
        fieldTypes={fieldTypes}
        onAddSection={addSection}
        className={className}
      >
        <SortableContext
          items={sections.filter((section) => section.variant === "additional").map((section) => section.id)}
          strategy={verticalListSortingStrategy}
        >
          {sections.map((section) => {
            const hasTotpField = section.id === "credentials" && sectionHasTotpField(section);
            const addableFieldTypes =
              section.variant === "additional"
                ? fieldTypes
                : section.id === "websites"
                  ? urlFieldTypes
                  : section.id === "credentials" && !hasTotpField
                    ? totpFieldTypes
                    : [];
            const sectionAddFieldLabel =
              section.id === "websites"
                ? messages.addUrl
                : section.id === "credentials"
                  ? messages.addTotp
                  : addFieldLabel;
            const sectionOnAddField =
              section.variant === "additional"
                ? (type: KeyFieldTypeOption) => addField(section.id, type)
                : section.id === "websites" || (section.id === "credentials" && !hasTotpField)
                  ? (type: KeyFieldTypeOption) => addField(section.id, type)
                  : undefined;
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
                  addFieldLabel={sectionAddFieldLabel}
                  sectionTitlePlaceholder={messages.sectionTitlePlaceholder}
                  editSectionTitleAriaLabel={messages.editSectionTitleAria}
                  onAddField={sectionOnAddField}
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
                addFieldLabel={sectionAddFieldLabel}
                sectionTitlePlaceholder={messages.sectionTitlePlaceholder}
                editSectionTitleAriaLabel={messages.editSectionTitleAria}
                onAddField={sectionOnAddField}
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
  );
}
