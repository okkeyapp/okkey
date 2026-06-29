import { Button, Spinner } from "@okkey/ui";

type PopupSaveButtonProps = {
  saving: boolean;
  saveLabel: string;
  savingLabel: string;
  onClick: () => void;
  className?: string;
};

export default function PopupSaveButton({
  saving,
  saveLabel,
  savingLabel,
  onClick,
  className,
}: PopupSaveButtonProps) {
  return (
    <Button type="button" className={className} onClick={onClick} disabled={saving}>
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
