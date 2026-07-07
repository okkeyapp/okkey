import { Button, Spinner } from "@okkey/ui";

type PopupSaveButtonProps = {
  saving: boolean;
  saveLabel: string;
  savingLabel: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

export default function PopupSaveButton({
  saving,
  saveLabel,
  savingLabel,
  onClick,
  disabled = false,
  className,
}: PopupSaveButtonProps) {
  return (
    <Button type="button" className={className} onClick={onClick} disabled={saving || disabled}>
      {saving ? (
        <>
          <Spinner size="small" className="size-4" />
          {savingLabel}
        </>
      ) : (
        saveLabel
      )}
    </Button>
  );
}
