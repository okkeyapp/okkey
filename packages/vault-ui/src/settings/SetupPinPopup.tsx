import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Input, Popup } from "@okkey/ui";
import { useCallback, useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

type SetupPinPopupProps = {
  open: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onSubmit: (pin: string) => void;
};

const PIN_LENGTH = 6;

const pinCellClassName =
  "h-[54px] w-full min-w-0 p-0 text-center text-lg font-semibold tabular-nums";

type SetupStep = "enter" | "confirm";

function emptyDigits(): string[] {
  return Array.from({ length: PIN_LENGTH }, () => "");
}

export function SetupPinPopup({ open, t, onClose, onSubmit }: SetupPinPopupProps) {
  const formId = useId();
  const labelId = useId();
  const [step, setStep] = useState<SetupStep>("enter");
  const [pinDigits, setPinDigits] = useState(emptyDigits);
  const [confirmDigits, setConfirmDigits] = useState(emptyDigits);
  const [error, setError] = useState<string | null>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const activeDigits = step === "enter" ? pinDigits : confirmDigits;
  const setActiveDigits = step === "enter" ? setPinDigits : setConfirmDigits;
  const pin = pinDigits.join("");
  const confirm = confirmDigits.join("");

  useEffect(() => {
    if (!open) {
      return;
    }
    const handle = window.setTimeout(() => {
      inputsRef.current[0]?.focus();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [open, step]);

  const resetState = useCallback(() => {
    setStep("enter");
    setPinDigits(emptyDigits());
    setConfirmDigits(emptyDigits());
    setError(null);
  }, []);

  const setDigitAt = useCallback(
    (index: number, char: string) => {
      const d = char.replace(/\D/g, "").slice(-1);
      setActiveDigits((prev) => {
        const next = [...prev];
        next[index] = d;
        return next;
      });
      if (d && index < PIN_LENGTH - 1) {
        inputsRef.current[index + 1]?.focus();
      }
    },
    [setActiveDigits],
  );

  const handleCellChange = useCallback(
    (index: number, value: string) => {
      setError(null);
      if (value.length > 1) {
        const pasted = value.replace(/\D/g, "").slice(0, PIN_LENGTH);
        if (pasted) {
          setActiveDigits(Array.from({ length: PIN_LENGTH }, (_, i) => pasted[i] ?? ""));
          inputsRef.current[Math.min(pasted.length, PIN_LENGTH - 1)]?.focus();
        }
        return;
      }
      setDigitAt(index, value);
    },
    [setActiveDigits, setDigitAt],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !activeDigits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowLeft" && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowRight" && index < PIN_LENGTH - 1) {
        inputsRef.current[index + 1]?.focus();
      }
    },
    [activeDigits],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      setError(null);
      const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LENGTH);
      if (!text) {
        return;
      }
      setActiveDigits(Array.from({ length: PIN_LENGTH }, (_, i) => text[i] ?? ""));
      inputsRef.current[Math.min(text.length, PIN_LENGTH - 1)]?.focus();
    },
    [setActiveDigits],
  );

  if (!open) {
    return null;
  }

  function handleClose() {
    resetState();
    onClose();
  }

  const primaryDisabled =
    step === "enter" ? pin.length !== PIN_LENGTH : confirm.length !== PIN_LENGTH;
  const primaryLabel =
    step === "enter"
      ? t("web.settingsPopup.vault.pin.setupNext")
      : t("web.settingsPopup.vault.pin.setupSubmit");

  return (
    <Popup
      className="z-popup-nested"
      width={420}
      header={t("web.settingsPopup.vault.pin.setupTitle")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      panelClassName="min-h-0"
      contentClassName="pt-0 pb-1"
      footer={
        <>
          {step === "confirm" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError(null);
                setConfirmDigits(emptyDigits());
                setStep("enter");
              }}
            >
              {t("web.settingsPopup.vault.pin.setupBack")}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={handleClose}>
              {t("web.newItemPopup.cancel")}
            </Button>
          )}
          <Button type="submit" form={formId} disabled={primaryDisabled}>
            {primaryLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex w-full flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === "enter") {
            if (pin.length !== PIN_LENGTH) {
              setError(t("web.settingsPopup.vault.pin.tooShort"));
              return;
            }
            setError(null);
            setConfirmDigits(emptyDigits());
            setStep("confirm");
            return;
          }
          if (confirm.length !== PIN_LENGTH) {
            setError(t("web.settingsPopup.vault.pin.tooShort"));
            return;
          }
          if (pin !== confirm) {
            setError(t("web.settingsPopup.vault.pin.mismatch"));
            setConfirmDigits(emptyDigits());
            window.setTimeout(() => inputsRef.current[0]?.focus(), 0);
            return;
          }
          setError(null);
          onSubmit(pin);
          resetState();
        }}
      >
        <p className="w-full text-sm leading-5 text-muted-foreground">
          {t("web.settingsPopup.vault.pin.setupDescription")}
        </p>
        {error ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex w-full flex-col gap-3">
          <span id={labelId} className="text-sm font-medium text-foreground">
            {step === "enter"
              ? t("web.settingsPopup.vault.pin.label")
              : t("web.settingsPopup.vault.pin.confirmLabel")}
          </span>
          <div
            role="group"
            aria-labelledby={labelId}
            className="grid w-full grid-cols-6 gap-2.5"
          >
            {activeDigits.map((digit, index) => (
              <Input
                key={`${step}-${index}`}
                ref={(el) => {
                  inputsRef.current[index] = el;
                }}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                name={`setup-pin-${step}-${index}`}
                maxLength={1}
                value={digit}
                aria-label={t("auth.otp.digitAriaLabel", { n: index + 1, total: PIN_LENGTH })}
                className={pinCellClassName}
                onChange={(event) => handleCellChange(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={index === 0 ? handlePaste : undefined}
              />
            ))}
          </div>
        </div>
      </form>
    </Popup>
  );
}
