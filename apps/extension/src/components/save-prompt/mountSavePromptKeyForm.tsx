import React, { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import extensionCss from "@/assets/extension.css?inline";

import {
  SavePromptKeyForm,
  type SavePromptKeyFormHandle,
  type SavePromptKeyFormProps,
  type SavePromptKeyFormQuery,
} from "./SavePromptKeyForm";

export type { SavePromptKeyFormHandle, SavePromptKeyFormQuery };

type MountedSavePromptKeyForm = {
  root: Root;
  handleRef: React.RefObject<SavePromptKeyFormHandle>;
};

let mounted: MountedSavePromptKeyForm | null = null;

/** Rewrite :root / .dark tokens so Tailwind vars resolve inside the closed shadow tree. */
export function prepareShadowExtensionCss(css: string): string {
  return css
    .replace(/:root\b/g, ":host, .okkey-tw")
    .replace(/([^\w\\-])\.dark(\s*[{,])/g, "$1.okkey-tw.dark$2");
}

export function shadowExtensionCssText(): string {
  return prepareShadowExtensionCss(extensionCss);
}

export function unmountSavePromptKeyForm(): void {
  if (!mounted) {
    return;
  }
  try {
    mounted.root.unmount();
  } catch {
    /* ignore */
  }
  mounted = null;
}

export function mountSavePromptKeyForm(
  container: Element,
  props: SavePromptKeyFormProps,
): React.RefObject<SavePromptKeyFormHandle> {
  unmountSavePromptKeyForm();
  const handleRef = createRef<SavePromptKeyFormHandle>();
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <SavePromptKeyForm ref={handleRef} {...props} />
    </React.StrictMode>,
  );
  mounted = { root, handleRef };
  return handleRef;
}

export function getSavePromptKeyFormHandle(): SavePromptKeyFormHandle | null {
  return mounted?.handleRef.current ?? null;
}
