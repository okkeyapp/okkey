import { Button } from "@okkey/ui";

import { IconDelete16 } from "../../items/itemCategoryIcons";

type SettingsRowDeleteButtonProps = {
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

export default function SettingsRowDeleteButton({ label, disabled = false, onClick }: SettingsRowDeleteButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="iconSm"
      className="text-destructive"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <IconDelete16 className="size-4 shrink-0" />
    </Button>
  );
}
