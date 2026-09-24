import { Button } from "@okkey/ui";

type PopupSaveButtonProps = {
  saving: boolean;
  saveLabel: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Shared Save control for popups: label stays fixed; only `disabled` while saving.
 */
export default function PopupSaveButton({
  saving,
  saveLabel,
  onClick,
  disabled = false,
  className,
}: PopupSaveButtonProps) {
  return (
    <Button type="button" className={className} onClick={onClick} disabled={saving || disabled}>
      {saveLabel}
    </Button>
  );
}
