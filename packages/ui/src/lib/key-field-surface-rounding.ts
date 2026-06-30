import { cn } from "./utils.js";

export type KeyFieldSurfaceRounding = {
  roundTop: boolean;
  roundBottom: boolean;
  squareSurface: boolean;
  transparentTopBorder: boolean;
  dragFirstBorder: boolean;
  dragLastBorderTransparent: boolean;
};

export type KeyFieldSurfaceRoundingInput = {
  mode: "view" | "edit";
  sectionVariant: "primary" | "additional";
  sectionTitle?: string;
  editableTitle?: boolean;
  fieldIndex: number;
  fieldsCount: number;
  canAddField: boolean;
  isFieldDragging?: boolean;
};

export function getKeyFieldSurfaceRounding(input: KeyFieldSurfaceRoundingInput): KeyFieldSurfaceRounding {
  const isEditMode = input.mode === "edit";
  const canEditTitle = isEditMode && input.sectionVariant === "additional" && Boolean(input.editableTitle);
  const shouldShowHeader = Boolean(input.sectionTitle) || canEditTitle;
  const isFirst = input.fieldIndex === 0;
  const isLast = input.fieldIndex === input.fieldsCount - 1;
  const squareSurface = Boolean(input.isFieldDragging) && input.sectionVariant === "primary";

  if (squareSurface) {
    return {
      roundTop: false,
      roundBottom: false,
      squareSurface: true,
      transparentTopBorder: false,
      dragFirstBorder: isFirst,
      dragLastBorderTransparent: isLast && !input.canAddField,
    };
  }

  return {
    roundTop: !shouldShowHeader && isFirst,
    roundBottom: isLast && !input.canAddField,
    squareSurface: false,
    transparentTopBorder: input.sectionVariant === "additional" && !shouldShowHeader && isFirst,
    dragFirstBorder: false,
    dragLastBorderTransparent: false,
  };
}

export function keyFieldSurfaceRoundingClassName(rounding: KeyFieldSurfaceRounding): string {
  return cn(
    rounding.roundTop && "rounded-t-xl",
    rounding.roundBottom && "rounded-b-xl",
    rounding.transparentTopBorder && "border-t-transparent",
    rounding.squareSurface && "!rounded-none !border-x-transparent",
    rounding.dragFirstBorder && "!border-t-border",
    rounding.dragLastBorderTransparent && "!border-b-transparent",
  );
}
