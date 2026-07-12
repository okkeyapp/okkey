import type { WebMessageValues } from "@okkey/i18n";
import { Button, cn, Input, Popover, PopoverContent, PopoverTrigger } from "@okkey/ui";
import { useEffect, useState } from "react";

import {
  normalizeHexColor,
  readableHexColor,
  WORKSPACE_TILE_PRESET_COLORS,
} from "./workspaceSettingsCatalog";
import { ChevronDownIcon } from "./workspaceSettingsIcons";

type WorkspaceTileColorPickerProps = {
  value: string;
  disabled?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onChange: (color: string) => void;
};

export default function WorkspaceTileColorPicker({
  value,
  disabled = false,
  t,
  onChange,
}: WorkspaceTileColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(readableHexColor(value).toUpperCase());

  useEffect(() => {
    setHexInput(readableHexColor(value).toUpperCase());
  }, [value]);

  const activeColor = normalizeHexColor(value) ?? value;

  function applyColor(nextColor: string) {
    const normalized = normalizeHexColor(nextColor);
    if (!normalized) {
      return;
    }
    onChange(normalized);
    setHexInput(normalized.toUpperCase());
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-9 w-[180px] justify-between gap-2 px-3 font-medium"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="size-5 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: activeColor }}
              aria-hidden
            />
            <span className="truncate">{t("web.workspaceSettings.general.changeColor")}</span>
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-0" sideOffset={8}>
        <div
          className="flex h-16 items-center justify-center rounded-t-md px-3 text-sm font-semibold text-white"
          style={{ backgroundColor: activeColor }}
        >
          {activeColor}
        </div>
        <div className="grid grid-cols-5 gap-2 p-3">
          {WORKSPACE_TILE_PRESET_COLORS.map((color) => {
            const selected = color === activeColor;
            return (
              <button
                key={color}
                type="button"
                className={cn(
                  "size-8 rounded-lg border border-black/10 transition-shadow",
                  selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
                style={{ backgroundColor: color }}
                aria-label={color}
                aria-pressed={selected}
                onClick={() => {
                  applyColor(color);
                  setOpen(false);
                }}
              />
            );
          })}
        </div>
        <div className="border-t border-border px-3 pb-3 pt-2">
          <Input
            value={hexInput}
            onChange={(event) => {
              const next = event.target.value;
              setHexInput(next.toUpperCase());
              const normalized = normalizeHexColor(next);
              if (normalized) {
                onChange(normalized);
              }
            }}
            aria-label={t("web.workspaceSettings.general.customColorLabel")}
            className="h-9 font-medium uppercase"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
