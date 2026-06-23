import * as React from "react";

import {
  mergeKeyFieldRecoveryCodesEditorLines,
  normalizeKeyFieldRecoveryCodesRows,
  normalizeRecoveryCodesEditorText,
  parseKeyFieldRecoveryCodesValue,
  serializeKeyFieldRecoveryCodesValue,
  splitRecoveryCodesPasteText,
  type KeyFieldRecoveryCode,
} from "../../lib/key-field-recovery-codes.js";
import { cn } from "../../lib/utils.js";
import { Checkbox } from "./checkbox.js";

const checkboxGutterClassName = "w-8 shrink-0 overflow-visible";
const textareaClassName =
  "min-h-10 min-w-0 flex-1 resize-none overflow-hidden bg-transparent p-0 text-sm leading-5 text-foreground outline-none font-mono placeholder:font-sans placeholder:text-muted-foreground";

export type KeyFieldRecoveryCodesInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  className?: string;
};

function editorLinesFromValue(value: string): KeyFieldRecoveryCode[] {
  const parsed = parseKeyFieldRecoveryCodesValue(value);
  if (parsed.length === 0) {
    return [{ code: "", used: false }];
  }

  return parsed.map((item) => ({ code: item.code, used: item.used }));
}

function editorLinesFromText(text: string, previous: KeyFieldRecoveryCode[]): KeyFieldRecoveryCode[] {
  const lineTexts = normalizeRecoveryCodesEditorText(text).split("\n");
  return mergeKeyFieldRecoveryCodesEditorLines(lineTexts, previous);
}

function editorTextFromLines(lines: KeyFieldRecoveryCode[]): string {
  return lines.map((line) => line.code).join("\n");
}

function appendRecoveryCodeEditorLineAtEnd(text: string): string {
  const normalized = normalizeRecoveryCodesEditorText(text);
  if (normalized.endsWith("\n") || normalized.length === 0) {
    return normalized;
  }

  return `${normalized}\n`;
}

export function KeyFieldRecoveryCodesInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  textareaRef,
  className,
}: KeyFieldRecoveryCodesInputProps) {
  const [lines, setLines] = React.useState<KeyFieldRecoveryCode[]>(() => editorLinesFromValue(value));
  const internalTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const isInternalChangeRef = React.useRef(false);
  const pendingCursorPositionRef = React.useRef<number | null>(null);

  const textareaValue = editorTextFromLines(lines);

  const resizeTextarea = React.useCallback(() => {
    const textarea = internalTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  const setTextareaRef = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      internalTextareaRef.current = node;
      if (typeof textareaRef === "function") {
        textareaRef(node);
      } else if (textareaRef) {
        (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      }

      if (node) {
        resizeTextarea();
        window.requestAnimationFrame(resizeTextarea);
      }
    },
    [resizeTextarea, textareaRef],
  );

  React.useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }

    setLines(editorLinesFromValue(value));
  }, [value]);

  React.useLayoutEffect(() => {
    resizeTextarea();

    if (pendingCursorPositionRef.current === null) {
      return;
    }

    const textarea = internalTextareaRef.current;
    if (!textarea) {
      return;
    }

    const position = pendingCursorPositionRef.current;
    pendingCursorPositionRef.current = null;
    textarea.setSelectionRange(position, position);
  }, [lines, resizeTextarea]);

  const commitLines = React.useCallback(
    (nextLines: KeyFieldRecoveryCode[]) => {
      isInternalChangeRef.current = true;
      setLines(nextLines);
      onValueChange(
        serializeKeyFieldRecoveryCodesValue(
          normalizeKeyFieldRecoveryCodesRows(nextLines.map((line) => ({ code: line.code, used: line.used }))),
        ),
      );
    },
    [onValueChange],
  );

  function applyTextChange(nextText: string) {
    commitLines(editorLinesFromText(nextText, lines));
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    let nextText = event.target.value;
    if (nextText.includes(",")) {
      nextText = nextText.replace(/,/g, "\n");
    }

    applyTextChange(nextText);
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    const nextText = appendRecoveryCodeEditorLineAtEnd(textareaValue);
    const nextLines = editorLinesFromText(nextText, lines);
    pendingCursorPositionRef.current = editorTextFromLines(nextLines).length;
    commitLines(nextLines);
  }

  function handleTextareaPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pastedText = event.clipboardData.getData("text");
    if (!pastedText.includes(",") && !/[\r\n]/.test(pastedText)) {
      return;
    }

    event.preventDefault();
    const textarea = internalTextareaRef.current;
    const selectionStart = textarea?.selectionStart ?? textareaValue.length;
    const selectionEnd = textarea?.selectionEnd ?? textareaValue.length;
    const pastedNormalized = splitRecoveryCodesPasteText(pastedText).join("\n");
    const nextText = `${textareaValue.slice(0, selectionStart)}${pastedNormalized}${textareaValue.slice(selectionEnd)}`;
    applyTextChange(nextText);
  }

  function handleUsedChange(index: number, used: boolean) {
    const nextLines = lines.map((line, lineIndex) => (lineIndex === index ? { ...line, used } : line));
    commitLines(nextLines);
  }

  function handlePanelBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextFocusedElement = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (nextFocusedElement && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }

    onBlur?.();
  }

  return (
    <div
      data-key-field-recovery-codes-editor
      className={cn("flex min-h-10 w-full overflow-visible", className)}
      onFocusCapture={() => onFocus?.()}
      onBlurCapture={handlePanelBlur}
    >
      <div className={cn("flex flex-col", checkboxGutterClassName)}>
        {lines.map((line, index) => (
          <div key={`recovery-code-checkbox-${index}`} className="flex h-5 items-center justify-center overflow-visible">
            <Checkbox
              checked={line.used}
              disabled={!line.code.trim()}
              onCheckedChange={(checked) => handleUsedChange(index, checked === true)}
            />
          </div>
        ))}
      </div>
      <textarea
        ref={setTextareaRef}
        value={textareaValue}
        rows={Math.max(2, lines.length)}
        placeholder="One recovery code per line"
        onChange={handleTextareaChange}
        onKeyDown={handleTextareaKeyDown}
        onPaste={handleTextareaPaste}
        className={textareaClassName}
      />
    </div>
  );
}
