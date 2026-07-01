import * as React from "react";

import { cn } from "../../lib/utils.js";
import {
  keyFormFieldSurfaceErrorRingClassName,
  keyFormFieldSurfaceFocusRingClassName,
  keyFormFieldSurfaceTransitionClassName,
} from "../../lib/input-like-control-classes.js";
import {
  keyFieldSurfaceRoundingClassName,
  type KeyFieldSurfaceRounding,
} from "../../lib/key-field-surface-rounding.js";
import { isKeyFieldDatePickerInteractionTarget } from "../../lib/key-field-date-picker.js";
import { formatKeyFieldAddressCopyValue, parseKeyFieldAddressValue } from "../../lib/key-field-address.js";
import {
  defaultKeyFieldFileUploadConstraints,
  isKeyFieldFileImageMimeType,
  parseKeyFieldFileValue,
  type KeyFieldFileUploadConstraints,
  type KeyFieldFileValue,
} from "../../lib/key-field-file.js";
import {
  parseKeyFieldRecoveryCodesValue,
} from "../../lib/key-field-recovery-codes.js";
import { Button } from "./button.js";
import { KeyFieldAddressInput } from "./key-field-address-input.js";
import { KeyFieldDateInput } from "./key-field-date-input.js";
import { KeyFieldDatePickerPanel } from "./key-field-date-picker-panel.js";
import { KeyFieldFileInput, KeyFieldFileView, type KeyFieldFileUploadHandler } from "./key-field-file-control.js";
import { KeyFieldFileLightbox } from "./key-field-file-lightbox.js";
import { KeyFieldRecoveryCodesInput } from "./key-field-recovery-codes-input.js";
import {
  KeyFieldRecoveryCodesChecklistView,
  KeyFieldRecoveryCodesConcealedView,
} from "./key-field-recovery-codes-view.js";

export type KeyFormMode = "view" | "edit";

export type KeyFieldValueTransformContext = {
  previousValue: string;
  selectionStart: number | null;
  inputType?: string;
};

export type KeyFieldTypeOption = {
  id: string;
  label: string;
  description?: string;
  group?: "general" | "secret" | "file";
};

export const keyFieldTypeOptions: readonly KeyFieldTypeOption[] = [
  { id: "text", label: "Text", group: "general" },
  { id: "email", label: "Email", group: "general" },
  { id: "phone", label: "Phone", group: "general" },
  { id: "address", label: "Address", group: "general" },
  { id: "date", label: "Date", group: "general" },
  { id: "url", label: "Website URL", group: "general" },
  { id: "multiline-text", label: "Multiline text", group: "general" },
  { id: "secret", label: "Secret", group: "secret" },
  { id: "totp", label: "Totp", group: "secret" },
  { id: "recovery-codes", label: "Recovery codes", group: "secret" },
  { id: "file", label: "File", group: "file" },
];

function PencilIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M2.33337 11.6667H4.66671L10.7917 5.54168C10.9449 5.38847 11.0664 5.20659 11.1494 5.00641C11.2323 4.80623 11.275 4.59168 11.275 4.37501C11.275 4.15834 11.2323 3.9438 11.1494 3.74362C11.0664 3.54344 10.9449 3.36156 10.7917 3.20835C10.6385 3.05514 10.4566 2.93361 10.2564 2.85069C10.0563 2.76777 9.84171 2.7251 9.62504 2.7251C9.40837 2.7251 9.19382 2.76777 8.99365 2.85069C8.79347 2.93361 8.61158 3.05514 8.45837 3.20835L2.33337 9.33335V11.6667Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.875 3.79175L10.2083 6.12508" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GripIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="9" cy="5" r="1.4" />
      <circle cx="15" cy="5" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="15" cy="19" r="1.4" />
    </svg>
  );
}

function CopyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M4.66602 6.44499C4.66602 5.97344 4.85334 5.5212 5.18678 5.18776C5.52022 4.85432 5.97246 4.66699 6.44402 4.66699H12.2213C12.4548 4.66699 12.686 4.71298 12.9018 4.80233C13.1175 4.89169 13.3135 5.02265 13.4786 5.18776C13.6437 5.35286 13.7747 5.54886 13.864 5.76458C13.9534 5.9803 13.9993 6.2115 13.9993 6.44499V12.2223C13.9993 12.4558 13.9534 12.687 13.864 12.9027C13.7747 13.1185 13.6437 13.3145 13.4786 13.4796C13.3135 13.6447 13.1175 13.7756 12.9018 13.865C12.686 13.9543 12.4548 14.0003 12.2213 14.0003H6.44402C6.21053 14.0003 5.97932 13.9543 5.7636 13.865C5.54789 13.7756 5.35188 13.6447 5.18678 13.4796C5.02168 13.3145 4.89071 13.1185 4.80136 12.9027C4.71201 12.687 4.66602 12.4558 4.66602 12.2223V6.44499Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.67467 11.158C2.47023 11.0415 2.30018 10.873 2.18172 10.6697C2.06325 10.4663 2.00057 10.2353 2 10V3.33333C2 2.6 2.6 2 3.33333 2H10C10.5 2 10.772 2.25667 11 2.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopySuccessIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M4.66602 6.44499C4.66602 5.97344 4.85334 5.5212 5.18678 5.18776C5.52022 4.85432 5.97246 4.66699 6.44402 4.66699H12.2213C12.4548 4.66699 12.686 4.71298 12.9018 4.80233C13.1175 4.89169 13.3135 5.02265 13.4786 5.18776C13.6437 5.35286 13.7747 5.54886 13.864 5.76458C13.9534 5.9803 13.9993 6.2115 13.9993 6.44499V12.2223C13.9993 12.4558 13.9534 12.687 13.864 12.9027C13.7747 13.1185 13.6437 13.3145 13.4786 13.4796C13.3135 13.6447 13.1175 13.7756 12.9018 13.865C12.686 13.9543 12.4548 14.0003 12.2213 14.0003H6.44402C6.21053 14.0003 5.97932 13.9543 5.7636 13.865C5.54789 13.7756 5.35188 13.6447 5.18678 13.4796C5.02168 13.3145 4.89071 13.1185 4.80136 12.9027C4.71201 12.687 4.66602 12.4558 4.66602 12.2223V6.44499Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.67467 11.158C2.47 11.0417 2.29977 10.8733 2.18127 10.6699C2.06277 10.4665 2.00023 10.2354 2 10V3.33333C2 2.6 2.6 2 3.33333 2H10C10.5 2 10.772 2.25667 11 2.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.33398 9.33333L8.66732 10.6667L11.334 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClearFileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M9.33337 2V4.66667C9.33337 4.84348 9.40361 5.01305 9.52864 5.13807C9.65366 5.2631 9.82323 5.33333 10 5.33333H12.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.3334 14H4.66671C4.31309 14 3.97395 13.8595 3.7239 13.6095C3.47385 13.3594 3.33337 13.0203 3.33337 12.6667V3.33333C3.33337 2.97971 3.47385 2.64057 3.7239 2.39052C3.97395 2.14048 4.31309 2 4.66671 2H9.33337L12.6667 5.33333V12.6667C12.6667 13.0203 12.5262 13.3594 12.2762 13.6095C12.0261 13.8595 11.687 14 11.3334 14Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.66663 8L9.33329 10.6667M9.33329 8L6.66663 10.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OpenFileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M9.33341 1.33325V3.99992C9.33341 4.35354 9.47389 4.69268 9.72394 4.94273C9.97399 5.19278 10.3131 5.33325 10.6667 5.33325H13.3334M10.0001 1.33325H4.00008C3.64646 1.33325 3.30732 1.47373 3.05727 1.72378C2.80722 1.97382 2.66675 2.31296 2.66675 2.66659V13.3333C2.66675 13.6869 2.80722 14.026 3.05727 14.2761C3.30732 14.5261 3.64646 14.6666 4.00008 14.6666H12.0001C12.3537 14.6666 12.6928 14.5261 12.9429 14.2761C13.1929 14.026 13.3334 13.6869 13.3334 13.3333V4.66659L10.0001 1.33325Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const keyFieldOverlayPillClassName =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[50px] border border-black/5 px-3 text-sm font-medium text-foreground dark:border-foreground/25";

const keyFieldSingleLineControlClassName =
  "m-0 block w-full min-w-0 border-0 bg-transparent p-0 text-sm leading-5 text-foreground outline-none";

/** Matches Tailwind `h-5` / `leading-5` for a single-line control. */
const KEY_FIELD_SINGLE_LINE_HEIGHT_PX = 20;

export type KeyFieldProps = Omit<React.ComponentPropsWithoutRef<"div">, "children"> & {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  mode?: KeyFormMode;
  editableLabel?: boolean;
  editableValue?: boolean;
  multilineValue?: boolean;
  dateValue?: boolean;
  addressValue?: boolean;
  recoveryCodesValue?: boolean;
  recoveryCodesRevealed?: boolean;
  fileValue?: boolean;
  fileUploadConstraints?: KeyFieldFileUploadConstraints;
  onFileUpload?: KeyFieldFileUploadHandler;
  onFileDelete?: (file: KeyFieldFileValue) => Promise<void>;
  autoFocusValue?: boolean;
  /** Bumps when the parent requests value focus again for the same field. */
  autoFocusValueRequest?: number;
  reorderable?: boolean;
  onLabelChange?: (label: string) => void;
  onValueChange?: (value: string) => void;
  onValueBlur?: () => void;
  onValueFocus?: () => void;
  /** Marks the value control as part of the password generator trigger area (outside-click handling). */
  passwordGeneratorTrigger?: boolean;
  /** Multiline secret: concealed as a single line; revealed as a compact textarea. */
  secretMultilineValue?: boolean;
  transformValueInput?: (value: string, context: KeyFieldValueTransformContext) => string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  copyValue?: string;
  copyLabel?: string;
  copySuccessLabel?: string | null;
  copyIcon?: React.ReactNode;
  copySuccessIcon?: React.ReactNode;
  copyIconPosition?: "start" | "end";
  copyHoverClassName?: string;
  copyHoverActiveClassName?: string;
  copyOverlayClassName?: string;
  copyTextClassName?: string;
  statusOverlayLabel?: string;
  floatingActions?: React.ReactNode;
  isHoverLocked?: boolean;
  forceActive?: boolean;
  isInvalid?: boolean;
  fieldOverlay?: React.ReactNode;
  concealValue?: boolean;
  concealedValue?: string;
  onCopyAction?: (value: string) => void | Promise<void>;
  labelClassName?: string;
  valueClassName?: string;
  controlButtonClassName?: string;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  addressFieldPlaceholders?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  addressSearchCountriesPlaceholder?: string;
  addressNoCountriesFoundMessage?: string;
  recoveryCodesPlaceholder?: string;
  fileUploadLabel?: string;
  fileClearLabel?: string;
  valuePlaceholder?: string;
  surfaceRounding?: KeyFieldSurfaceRounding;
};

export const KeyField = React.forwardRef<HTMLDivElement, KeyFieldProps>(
  (
    {
      className,
      label,
      value,
      children,
      mode = "view",
      editableLabel = false,
      editableValue = false,
      multilineValue = false,
      dateValue = false,
      addressValue = false,
      recoveryCodesValue = false,
      recoveryCodesRevealed = false,
      fileValue = false,
      fileUploadConstraints = defaultKeyFieldFileUploadConstraints,
      onFileUpload,
      onFileDelete,
      autoFocusValue = false,
      autoFocusValueRequest = 0,
      reorderable = false,
      onLabelChange,
      onValueChange,
      onValueBlur,
      onValueFocus,
      passwordGeneratorTrigger = false,
      secretMultilineValue = false,
      transformValueInput,
      meta,
      actions,
      copyValue,
      copyLabel = "Copy",
      copySuccessLabel = "Coped",
      copyIcon,
      copySuccessIcon,
      copyIconPosition = "start",
      copyHoverClassName,
      copyHoverActiveClassName,
      copyOverlayClassName,
      copyTextClassName,
      statusOverlayLabel,
      floatingActions,
      isHoverLocked = false,
      forceActive = false,
      isInvalid = false,
      fieldOverlay,
      concealValue = false,
      concealedValue = "••••••••••",
      onCopyAction,
      labelClassName,
      valueClassName,
      controlButtonClassName,
      dragHandleProps,
      addressFieldPlaceholders,
      addressSearchCountriesPlaceholder,
      addressNoCountriesFoundMessage,
      recoveryCodesPlaceholder,
      fileUploadLabel,
      fileClearLabel = "Clear",
      valuePlaceholder,
      surfaceRounding,
      draggable,
      onDragStart,
      onDragEnd,
      onClick,
      ...props
    },
    ref,
  ) => {
    const [isEditingLabel, setIsEditingLabel] = React.useState(false);
    const [isValueFocused, setIsValueFocused] = React.useState(false);
    const [isDatePickerOpen, setIsDatePickerOpen] = React.useState(false);
    const hasAutoFocusedValueRef = React.useRef(false);
    const lastAutoFocusRequestRef = React.useRef<number | undefined>(undefined);
    const prevSecretMultilineValueRef = React.useRef(secretMultilineValue);
    const ignoreValueBlurRef = React.useRef(false);
    const valueInputRef = React.useRef<HTMLInputElement | null>(null);
    const valueTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [draftLabel, setDraftLabel] = React.useState(label);
    const stringValue = typeof value === "string" ? value : undefined;
    const [draftValue, setDraftValue] = React.useState(stringValue ?? "");
    const canEditLabel = mode === "edit" && editableLabel;
    const canEditValue = mode === "edit" && editableValue && children === undefined && stringValue !== undefined;
    const canReorder = mode === "edit" && reorderable;
    if (prevSecretMultilineValueRef.current !== secretMultilineValue) {
      prevSecretMultilineValueRef.current = secretMultilineValue;
      ignoreValueBlurRef.current = true;
    }
    const shouldConcealValue = concealValue && !isValueFocused && draftValue.length > 0;
    const useCompactMultilineEditor = secretMultilineValue && !shouldConcealValue;
    const useConcealedSingleLineEditor = secretMultilineValue && shouldConcealValue;
    const shouldAutoResizeTextarea = multilineValue || recoveryCodesValue || secretMultilineValue;
    const displayedValue = shouldConcealValue ? concealedValue : children ?? value;
    const formattedAddressValue =
      addressValue && typeof stringValue === "string"
        ? formatKeyFieldAddressCopyValue(parseKeyFieldAddressValue(stringValue))
        : "";
    const parsedRecoveryCodesValue =
      recoveryCodesValue && typeof stringValue === "string" ? parseKeyFieldRecoveryCodesValue(stringValue) : [];
    const parsedFileValue = fileValue ? parseKeyFieldFileValue(draftValue) : null;
    const [fileValidationError, setFileValidationError] = React.useState(false);
    const [fileLightboxOpen, setFileLightboxOpen] = React.useState(false);
    const hasValidationError = isInvalid || (fileValue && fileValidationError);
    const isSurfaceActiveByState = (dateValue && isDatePickerOpen) || forceActive;
    const hasOpenOverlay = Boolean(fieldOverlay) || forceActive;
    const canShowStatusOverlay =
      mode === "view" && Boolean(statusOverlayLabel) && !(recoveryCodesValue && recoveryCodesRevealed);
    const canOpenFileValue = mode === "view" && fileValue && parsedFileValue !== null;
    const copyText = copyValue ?? stringValue;
    const canCopyValue =
      mode === "view" &&
      typeof copyText === "string" &&
      copyText.length > 0 &&
      !fileValue &&
      !(recoveryCodesValue && recoveryCodesRevealed);
    const [isCopied, setIsCopied] = React.useState(false);
    const copyResetTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentCopyIcon = isCopied
      ? copySuccessIcon ?? <CopySuccessIcon className="size-4" />
      : copyIcon ?? <CopyIcon className="size-4" />;

    const resizeTextarea = React.useCallback(() => {
      if (!shouldAutoResizeTextarea) {
        return;
      }

      const valueControl = valueTextareaRef.current;
      if (!valueControl) {
        return;
      }

      valueControl.style.height = "auto";
      const measuredHeight = valueControl.scrollHeight;
      const nextHeight = secretMultilineValue
        ? Math.max(KEY_FIELD_SINGLE_LINE_HEIGHT_PX, measuredHeight)
        : measuredHeight;
      valueControl.style.height = `${nextHeight}px`;
    }, [secretMultilineValue, shouldAutoResizeTextarea]);

    const setValueTextareaRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        valueTextareaRef.current = node;
        if (node && shouldAutoResizeTextarea) {
          resizeTextarea();
          window.requestAnimationFrame(resizeTextarea);
        }
      },
      [resizeTextarea, shouldAutoResizeTextarea],
    );

    const revealSecretMultilineEditor = React.useCallback(() => {
      setIsValueFocused(true);
      onValueFocus?.();
    }, [onValueFocus]);

    const handleValueControlBlur = React.useCallback(() => {
      if (ignoreValueBlurRef.current) {
        return;
      }
      setIsValueFocused(false);
      onValueBlur?.();
    }, [onValueBlur]);

    const focusValueControl = React.useCallback(() => {
      if (fileValue) {
        return;
      }

      if (secretMultilineValue && concealValue && draftValue.length > 0 && !isValueFocused) {
        revealSecretMultilineEditor();
        return;
      }

      if (multilineValue || recoveryCodesValue || secretMultilineValue) {
        valueTextareaRef.current?.focus();
        return;
      }

      if (dateValue) {
        valueInputRef.current?.focus();
        return;
      }

      if (addressValue) {
        valueInputRef.current?.focus();
        return;
      }

      valueInputRef.current?.focus();
    }, [
      addressValue,
      concealValue,
      dateValue,
      draftValue.length,
      fileValue,
      isValueFocused,
      multilineValue,
      recoveryCodesValue,
      revealSecretMultilineEditor,
      secretMultilineValue,
    ]);

    const getValueControlElement = React.useCallback((): HTMLElement | null => {
      if (fileValue) {
        return null;
      }

      if (multilineValue || recoveryCodesValue || secretMultilineValue) {
        return valueTextareaRef.current;
      }

      return valueInputRef.current;
    }, [fileValue, multilineValue, recoveryCodesValue, secretMultilineValue]);

    React.useEffect(() => {
      setDraftLabel(label);
    }, [label]);

    React.useEffect(() => {
      setDraftValue(stringValue ?? "");
    }, [stringValue]);

    React.useLayoutEffect(() => {
      if (shouldAutoResizeTextarea) {
        resizeTextarea();
      }
    }, [draftValue, shouldAutoResizeTextarea, resizeTextarea]);

    React.useLayoutEffect(() => {
      if (!canEditValue || !secretMultilineValue || !isValueFocused || shouldConcealValue) {
        return;
      }

      const textarea = valueTextareaRef.current;
      if (!textarea) {
        return;
      }

      resizeTextarea();

      if (document.activeElement !== textarea) {
        textarea.focus();
        const end = textarea.value.length;
        textarea.setSelectionRange(end, end);
      }
    }, [canEditValue, isValueFocused, resizeTextarea, secretMultilineValue, shouldConcealValue]);

    React.useEffect(() => {
      if (!ignoreValueBlurRef.current) {
        return;
      }

      ignoreValueBlurRef.current = false;

      if (!canEditValue) {
        return;
      }

      setIsValueFocused(true);

      function focusAfterSecretEditorSwap() {
        if (secretMultilineValue) {
          const textarea = valueTextareaRef.current;
          if (!textarea) {
            return;
          }
          if (document.activeElement !== textarea) {
            textarea.focus();
            const end = textarea.value.length;
            textarea.setSelectionRange(end, end);
          }
          return;
        }

        valueInputRef.current?.focus();
      }

      focusAfterSecretEditorSwap();
      window.requestAnimationFrame(focusAfterSecretEditorSwap);
    }, [canEditValue, secretMultilineValue]);

    React.useEffect(() => {
      if (!autoFocusValue) {
        hasAutoFocusedValueRef.current = false;
        lastAutoFocusRequestRef.current = undefined;
        return undefined;
      }

      if (hasAutoFocusedValueRef.current && lastAutoFocusRequestRef.current === autoFocusValueRequest) {
        return undefined;
      }

      hasAutoFocusedValueRef.current = true;
      lastAutoFocusRequestRef.current = autoFocusValueRequest;

      let cancelled = false;
      let retryTimeoutId: number | undefined;

      function markValueFocusedIfNeeded() {
        if (!canEditValue || fileValue) {
          return;
        }

        setIsValueFocused(true);
      }

      function tryAutoFocus(attempt = 0) {
        if (cancelled) {
          return;
        }

        if (dateValue) {
          setIsDatePickerOpen(true);
        }

        focusValueControl();

        const control = getValueControlElement();
        if (control && document.activeElement === control) {
          if (dateValue) {
            setIsValueFocused(true);
            setIsDatePickerOpen(true);
          } else {
            markValueFocusedIfNeeded();
          }
          return;
        }

        if (attempt < 12) {
          retryTimeoutId = window.setTimeout(() => tryAutoFocus(attempt + 1), 50);
        }
      }

      const frameId = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => tryAutoFocus());
      });

      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frameId);
        if (retryTimeoutId) {
          window.clearTimeout(retryTimeoutId);
        }
      };
    }, [
      autoFocusValue,
      autoFocusValueRequest,
      canEditValue,
      dateValue,
      fileValue,
      focusValueControl,
      getValueControlElement,
    ]);

    React.useEffect(() => {
      if (canEditValue) {
        return;
      }

      setIsValueFocused(false);
      setIsDatePickerOpen(false);
    }, [canEditValue]);

    React.useEffect(
      () => () => {
        if (copyResetTimeoutRef.current) {
          clearTimeout(copyResetTimeoutRef.current);
        }
      },
      [],
    );

    const closeDatePicker = React.useCallback(() => {
      setIsDatePickerOpen(false);
      setIsValueFocused(false);
      valueInputRef.current?.blur();
    }, []);

    const handleDatePickerValueChange = React.useCallback(
      (nextValue: string) => {
        setDraftValue(nextValue);
        onValueChange?.(nextValue);
      },
      [onValueChange],
    );

    const handleDateInputFocus = React.useCallback(() => {
      setIsValueFocused(true);
      setIsDatePickerOpen(true);
    }, []);

    const handleDateInputBlur = React.useCallback(() => {
      window.setTimeout(() => {
        const activeElement = document.activeElement;
        if (isKeyFieldDatePickerInteractionTarget(activeElement)) {
          return;
        }
        closeDatePicker();
      }, 0);
    }, [closeDatePicker]);

    React.useEffect(() => {
      if (!dateValue || !isDatePickerOpen) {
        return undefined;
      }

      function handleDocumentPointerDown(event: PointerEvent) {
        const target = event.target instanceof Element ? event.target : null;
        if (isKeyFieldDatePickerInteractionTarget(target)) {
          return;
        }
        if (valueInputRef.current && target && valueInputRef.current.contains(target)) {
          return;
        }
        closeDatePicker();
      }

      const timeoutId = window.setTimeout(() => {
        document.addEventListener("pointerdown", handleDocumentPointerDown);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
        document.removeEventListener("pointerdown", handleDocumentPointerDown);
      };
    }, [closeDatePicker, dateValue, isDatePickerOpen]);

    function commitLabel() {
      const nextLabel = draftLabel.trim();
      setIsEditingLabel(false);
      if (nextLabel && nextLabel !== label) {
        onLabelChange?.(nextLabel);
      } else {
        setDraftLabel(label);
      }
    }

    function handleValueChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
      const nativeEvent = event.nativeEvent instanceof InputEvent ? event.nativeEvent : undefined;
      const nextValue = transformValueInput
        ? transformValueInput(event.target.value, {
            previousValue: draftValue,
            selectionStart: event.currentTarget.selectionStart,
            inputType: nativeEvent?.inputType,
          })
        : event.target.value;
      setDraftValue(nextValue);
      onValueChange?.(nextValue);
    }

    async function handleCopyClick(event: React.MouseEvent<HTMLButtonElement>) {
      event.preventDefault();
      event.stopPropagation();
      if (!canCopyValue) {
        return;
      }

      if (onCopyAction) {
        await onCopyAction(copyText);
      } else {
        await navigator.clipboard.writeText(copyText);
      }
      if (copySuccessLabel !== null) {
        setIsCopied(true);
      }
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = setTimeout(() => {
        setIsCopied(false);
        copyResetTimeoutRef.current = null;
      }, 3000);
    }

    function handleOpenFileClick(event: React.MouseEvent<HTMLButtonElement>) {
      event.preventDefault();
      event.stopPropagation();
      handleOpenFile();
    }

    function handleOpenFile() {
      if (!parsedFileValue) {
        return;
      }

      if (isKeyFieldFileImageMimeType(parsedFileValue.mimeType)) {
        setFileLightboxOpen(true);
        return;
      }

      window.open(parsedFileValue.url, "_blank", "noopener,noreferrer");
    }

    function handleFileClear() {
      if (!parsedFileValue) {
        return;
      }

      setDraftValue("");
      onValueChange?.("");
    }

    function handleFieldClick(event: React.MouseEvent<HTMLDivElement>) {
      onClick?.(event);
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "button,input,textarea,select,a,[role='button'],[role='checkbox'],label,[data-key-field-drag-handle]",
        )
      ) {
        return;
      }

      if (canEditValue) {
        focusValueControl();
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          "group/key-field -mt-px flex min-w-0 items-center gap-2.5 border-x border-y border-x-transparent border-y-border px-4 py-2",
          keyFormFieldSurfaceTransitionClassName,
          surfaceRounding && keyFieldSurfaceRoundingClassName(surfaceRounding),
          fieldOverlay && "relative",
          (canCopyValue || canOpenFileValue || canShowStatusOverlay || floatingActions) && "relative",
          (canCopyValue || canOpenFileValue || canShowStatusOverlay) && copyHoverClassName,
          isHoverLocked && copyHoverActiveClassName,
          className,
          hasOpenOverlay && "relative z-30",
          !hasValidationError && [
            "focus-within:relative focus-within:z-10",
            "focus-within:border-x-accent focus-within:!border-y-accent",
            "focus-within:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
          ],
          hasValidationError && ["relative z-[1]", keyFormFieldSurfaceErrorRingClassName, "focus-within:z-10"],
          isSurfaceActiveByState && !hasValidationError && ["relative z-10", keyFormFieldSurfaceFocusRingClassName],
          isSurfaceActiveByState && hasValidationError && "relative z-10",
        )}
        draggable={canReorder ? draggable : false}
        onDragStart={canReorder ? onDragStart : undefined}
        onDragEnd={canReorder ? onDragEnd : undefined}
        onClick={handleFieldClick}
        {...props}
      >
        {canReorder ? (
          <span
            className={cn(
              "-ml-2 flex size-4 shrink-0 touch-none items-center justify-center text-muted-foreground/70",
              "cursor-grab active:cursor-grabbing",
              dragHandleProps?.className,
            )}
            aria-hidden
            data-key-field-drag-handle
            {...dragHandleProps}
          >
            <GripIcon className="size-4" />
          </span>
        ) : null}

        {canCopyValue ? (
          <button
            type="button"
            className={cn(
              "pointer-events-none absolute inset-0 z-10 flex rounded-[inherit] items-center justify-center opacity-0 transition-opacity",
              "group-hover/key-field:pointer-events-auto group-hover/key-field:opacity-100",
              "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
              isHoverLocked && "pointer-events-auto opacity-100",
              copyOverlayClassName ?? "bg-card/20",
            )}
            onClick={handleCopyClick}
          >
            <span className={cn(keyFieldOverlayPillClassName, copyTextClassName ?? "bg-card")}>
              {copyIconPosition === "start" ? currentCopyIcon : null}
              {isCopied ? copySuccessLabel : copyLabel}
              {copyIconPosition === "end" ? currentCopyIcon : null}
            </span>
          </button>
        ) : null}

        {canOpenFileValue ? (
          <button
            type="button"
            className={cn(
              "pointer-events-none absolute inset-0 z-10 flex rounded-[inherit] items-center justify-center opacity-0 transition-opacity",
              "group-hover/key-field:pointer-events-auto group-hover/key-field:opacity-100",
              "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
              isHoverLocked && "pointer-events-auto opacity-100",
              copyOverlayClassName ?? "bg-card/20",
            )}
            onClick={handleOpenFileClick}
          >
            <span className={cn(keyFieldOverlayPillClassName, copyTextClassName ?? "bg-card")}>
              <OpenFileIcon className="size-4" />
              Open
            </span>
          </button>
        ) : null}

        {canShowStatusOverlay ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-10 flex rounded-[inherit] items-center justify-center opacity-0 transition-opacity",
              "group-hover/key-field:opacity-100",
              isHoverLocked && "opacity-100",
              copyOverlayClassName ?? "bg-card/20",
            )}
          >
            <span className={cn(keyFieldOverlayPillClassName, copyTextClassName ?? "bg-card")}>
              {statusOverlayLabel}
            </span>
          </div>
        ) : null}

        {floatingActions ? (
          <div
            className={cn(
              "pointer-events-none absolute right-4 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity",
              "group-hover/key-field:pointer-events-auto group-hover/key-field:opacity-100",
              isHoverLocked && "pointer-events-auto opacity-100",
            )}
          >
            {floatingActions}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {isEditingLabel ? (
              <input
                data-key-field-label-input
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                onBlur={commitLabel}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitLabel();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setDraftLabel(label);
                    setIsEditingLabel(false);
                  }
                }}
                autoFocus
                className={cn(
                  "h-5 min-w-0 flex-1 bg-transparent p-0 text-xs text-foreground outline-none",
                  "focus-visible:ring-0",
                  labelClassName,
                )}
              />
            ) : (
              <span className={cn("min-w-0 truncate text-xs leading-5 text-muted-foreground", canEditLabel && "text-foreground", labelClassName)}>
                {label}
              </span>
            )}
            {canEditLabel && !isEditingLabel ? (
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                className={cn("size-5 min-h-5 min-w-5 rounded-sm text-muted-foreground hover:text-foreground", controlButtonClassName)}
                onClick={() => {
                  if (addressValue || recoveryCodesValue || fileValue) {
                    setIsValueFocused(false);
                  }
                  setIsEditingLabel(true);
                }}
                aria-label="Редактировать лейбл поля"
              >
                <PencilIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div
              className={cn(
                "relative min-w-0 flex-1 text-sm leading-5 text-foreground",
                fileValue ? "min-h-20" : "min-h-5",
                mode === "view" && !canEditValue && !addressValue && !recoveryCodesValue && !fileValue && "break-all",
                valueClassName,
              )}
            >
              {canEditValue ? (
                useConcealedSingleLineEditor ? (
                  <input
                    ref={valueInputRef}
                    value={concealedValue}
                    readOnly
                    onFocus={revealSecretMultilineEditor}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      revealSecretMultilineEditor();
                    }}
                    className={cn(keyFieldSingleLineControlClassName, "h-5 cursor-text")}
                  />
                ) : useCompactMultilineEditor ? (
                  <textarea
                    ref={setValueTextareaRef}
                    value={draftValue}
                    placeholder={valuePlaceholder}
                    onChange={handleValueChange}
                    onFocus={() => {
                      setIsValueFocused(true);
                      resizeTextarea();
                      onValueFocus?.();
                    }}
                    onBlur={handleValueControlBlur}
                    style={{ height: KEY_FIELD_SINGLE_LINE_HEIGHT_PX }}
                    className={cn(
                      keyFieldSingleLineControlClassName,
                      "resize-none overflow-hidden placeholder:text-muted-foreground",
                    )}
                  />
                ) : multilineValue ? (
                  <textarea
                    ref={setValueTextareaRef}
                    value={draftValue}
                    rows={2}
                    placeholder={valuePlaceholder}
                    onChange={handleValueChange}
                    onFocus={() => {
                      setIsValueFocused(true);
                      resizeTextarea();
                    }}
                    onBlur={() => setIsValueFocused(false)}
                    className="min-h-10 w-full min-w-0 resize-none overflow-hidden bg-transparent p-0 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
                  />
                ) : recoveryCodesValue ? (
                  <KeyFieldRecoveryCodesInput
                    textareaRef={setValueTextareaRef}
                    value={draftValue}
                    onValueChange={(nextValue) => {
                      setDraftValue(nextValue);
                      onValueChange?.(nextValue);
                    }}
                    onFocus={() => {
                      setIsValueFocused(true);
                      resizeTextarea();
                    }}
                    onBlur={() => setIsValueFocused(false)}
                    placeholder={recoveryCodesPlaceholder ?? valuePlaceholder}
                  />
                ) : fileValue ? (
                  <KeyFieldFileInput
                    value={draftValue}
                    onValueChange={(nextValue) => {
                      setDraftValue(nextValue);
                      onValueChange?.(nextValue);
                    }}
                    onUploadFile={onFileUpload}
                    uploadConstraints={fileUploadConstraints}
                    onValidationErrorChange={setFileValidationError}
                    uploadLabel={fileUploadLabel}
                  />
                ) : addressValue ? (
                  <KeyFieldAddressInput
                    streetInputRef={valueInputRef}
                    value={draftValue}
                    onValueChange={(nextValue) => {
                      setDraftValue(nextValue);
                      onValueChange?.(nextValue);
                    }}
                    onFocus={() => setIsValueFocused(true)}
                    onBlur={() => setIsValueFocused(false)}
                    fieldPlaceholders={addressFieldPlaceholders}
                    searchCountriesPlaceholder={addressSearchCountriesPlaceholder}
                    noCountriesFoundMessage={addressNoCountriesFoundMessage}
                  />
                ) : dateValue ? (
                  <KeyFieldDateInput
                    inputRef={valueInputRef}
                    value={draftValue}
                    onValueChange={(nextValue) => {
                      setDraftValue(nextValue);
                      onValueChange?.(nextValue);
                    }}
                    onFocus={handleDateInputFocus}
                    onBlur={handleDateInputBlur}
                    placeholder={valuePlaceholder}
                  />
                ) : (
                  <input
                    ref={valueInputRef}
                    value={shouldConcealValue ? concealedValue : draftValue}
                    placeholder={shouldConcealValue && draftValue.length > 0 ? undefined : valuePlaceholder}
                    onChange={handleValueChange}
                    onFocus={() => {
                      setIsValueFocused(true);
                      onValueFocus?.();
                    }}
                    onBlur={handleValueControlBlur}
                    {...(passwordGeneratorTrigger ? { "data-password-generator-trigger": true } : {})}
                    className="h-5 w-full min-w-0 bg-transparent p-0 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
                  />
                )
              ) : recoveryCodesValue ? (
                recoveryCodesRevealed ? (
                  <KeyFieldRecoveryCodesChecklistView codes={parsedRecoveryCodesValue} readOnly />
                ) : (
                  <KeyFieldRecoveryCodesConcealedView codes={parsedRecoveryCodesValue} />
                )
              ) : fileValue ? (
                <KeyFieldFileView value={draftValue} onOpen={mode === "view" ? handleOpenFile : undefined} />
              ) : addressValue ? (
                formattedAddressValue
              ) : secretMultilineValue && !shouldConcealValue ? (
                <span className="whitespace-pre-wrap break-words">{displayedValue}</span>
              ) : (
                displayedValue
              )}
              {dateValue && canEditValue && isDatePickerOpen ? (
                <KeyFieldDatePickerPanel
                  value={draftValue}
                  onValueChange={handleDatePickerValueChange}
                  onClose={closeDatePicker}
                />
              ) : null}
              {fieldOverlay}
            </div>
            {meta ? <div className="shrink-0">{meta}</div> : null}
          </div>
        </div>

        {canEditValue && parsedFileValue && fileValue ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-8 px-3", controlButtonClassName)}
              onClick={handleFileClear}
            >
              <ClearFileIcon className="size-4" />
              {fileClearLabel}
            </Button>
            {actions}
          </div>
        ) : actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : null}
        {fileLightboxOpen && parsedFileValue && isKeyFieldFileImageMimeType(parsedFileValue.mimeType) ? (
          <KeyFieldFileLightbox file={parsedFileValue} onClose={() => setFileLightboxOpen(false)} />
        ) : null}
      </div>
    );
  },
);
KeyField.displayName = "KeyField";
