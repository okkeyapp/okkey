import type { ProductTourStep, Vault } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault } from "../auth/AuthVaultContext";
import { createKeyFormEditorMessages } from "../components/key-form/keyFormI18n";
import {
  buildPersonalDataBootstrapItem,
  hasSoftDeletedPersonalDataItem,
  shouldSkipPersonalDataBootstrap,
} from "../items/personalDataBootstrap";
import { isPersonalDataBootstrapDismissed } from "../items/personalDataBootstrapDismissal";
import { useWorkspaceItems } from "../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../items/WorkspaceVaultProfilesContext";
import { useLocale } from "../locale/LocaleContext";
import {
  EDIT_ITEM_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../routes/popupQuery";
import { useItemCategoryPreferences } from "../components/items/useItemCategoryPreferences";
import { PRODUCT_TOUR_ANCHOR, productTourAnchorSelector } from "./productTourAnchors";
import { useProductTour } from "./ProductTourContext";
import { ProductTourOverlay } from "./ProductTourOverlay";
import { isLastProductTourStep, nextProductTourStep } from "./productTourState";

type ProductTourControllerProps = {
  workspaceId: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
  accountMenuOpen: boolean;
  onAccountMenuOpenChange: (open: boolean) => void;
};

function stepCopy(
  step: ProductTourStep,
  t: (key: string) => string,
): { title: string; body: string; nextLabel: string } {
  switch (step) {
    case 1:
      return {
        title: t("web.productTour.step1.title"),
        body: t("web.productTour.step1.body"),
        nextLabel: t("web.productTour.next"),
      };
    case 2:
      return {
        title: t("web.productTour.step2.title"),
        body: t("web.productTour.step2.body"),
        nextLabel: t("web.productTour.next"),
      };
    case 3:
      return {
        title: t("web.productTour.step3.title"),
        body: t("web.productTour.step3.body"),
        nextLabel: t("web.productTour.next"),
      };
    case 4:
      return {
        title: t("web.productTour.step4.title"),
        body: t("web.productTour.step4.body"),
        nextLabel: t("web.productTour.ok"),
      };
  }
}

function anchorsForStep(step: ProductTourStep): string[] {
  switch (step) {
    case 1:
      return [productTourAnchorSelector(PRODUCT_TOUR_ANCHOR.createItem)];
    case 2:
      // Spotlight the account footer; My settings / Device settings live in that menu.
      return [productTourAnchorSelector(PRODUCT_TOUR_ANCHOR.accountMenu)];
    case 3:
      return [productTourAnchorSelector(PRODUCT_TOUR_ANCHOR.workspaceSettings)];
    case 4:
      return [];
  }
}

/**
 * First-sign-in product tour after vault unlock. Progress is stored on the account profile.
 */
export default function ProductTourController({
  workspaceId,
  vaults,
  vaultsListReady,
  accountMenuOpen,
  onAccountMenuOpenChange,
}: ProductTourControllerProps) {
  const { t, locale } = useLocale();
  const { profile, vaultUnlocked, userId } = useAuthVault();
  const { items, bootstrapped, createItem } = useWorkspaceItems();
  const { canPostToVault } = useWorkspaceVaultProfiles();
  const {
    ready: preferencesReady,
    personalDataBootstrapDismissed,
    markPersonalDataBootstrapDismissed,
  } = useItemCategoryPreferences();
  const { ready: tourReady, completed, step, setStep, complete, skip } = useProductTour();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [step4OverlayVisible, setStep4OverlayVisible] = useState(true);
  const [step4ItemId, setStep4ItemId] = useState<string | null>(null);
  const step4InFlightRef = useRef(false);
  const navigateRef = useRef(navigate);
  const locationRef = useRef(location);
  navigateRef.current = navigate;
  locationRef.current = location;

  const active = tourReady && !completed && vaultUnlocked;

  // Close the account menu while the tour chrome is showing (overlay owns focus).
  useEffect(() => {
    if (active && accountMenuOpen) {
      onAccountMenuOpenChange(false);
    }
  }, [active, step, accountMenuOpen, onAccountMenuOpenChange]);

  // Step 4: ensure Personal data item exists and open its edit popup with overlay.
  useEffect(() => {
    if (
      !active ||
      step !== 4 ||
      !bootstrapped ||
      !vaultsListReady ||
      !workspaceId ||
      !userId ||
      !preferencesReady ||
      step4InFlightRef.current
    ) {
      return;
    }

    // After OK, keep the open popup for fill/save/close — do not reopen if the user closes it.
    if (!step4OverlayVisible) {
      return;
    }

    if (hasSoftDeletedPersonalDataItem(items) && !personalDataBootstrapDismissed) {
      markPersonalDataBootstrapDismissed();
    }

    const dismissed =
      personalDataBootstrapDismissed || isPersonalDataBootstrapDismissed(userId, workspaceId);

    const openEdit = (itemId: string) => {
      setStep4ItemId(itemId);
      setStep4OverlayVisible(true);
      const currentLocation = locationRef.current;
      const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
      if (activePopup?.popupId === EDIT_ITEM_POPUP_ID && activePopup.menuItemId === itemId) {
        return;
      }
      navigateRef.current(
        {
          pathname: currentLocation.pathname,
          search: popupQuerySearch(
            currentLocation.search,
            buildPopupQueryValue(EDIT_ITEM_POPUP_ID, itemId),
          ),
          hash: currentLocation.hash,
        },
        { replace: false },
      );
    };

    const existing = items.find(
      (item) => item.categoryId === "personal_data" && !item.deleted,
    );
    if (existing) {
      openEdit(existing.itemId);
      return;
    }

    if (shouldSkipPersonalDataBootstrap(items, dismissed)) {
      // Soft-deleted / dismissed: still show the explanation overlay without a form.
      setStep4ItemId(null);
      setStep4OverlayVisible(true);
      return;
    }

    const personalVault = vaults.find((vault) => vault.isPersonal);
    if (!personalVault || !canPostToVault(personalVault.id)) {
      return;
    }

    // Wait for other popups to close before opening personal data.
    const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
    if (activePopup && activePopup.popupId !== EDIT_ITEM_POPUP_ID) {
      return;
    }

    const title = t("web.newItemPopup.categories.personalData");
    const messages = createKeyFormEditorMessages(locale);
    const itemId = generateEntityId();
    const item = buildPersonalDataBootstrapItem({
      itemId,
      vaultId: personalVault.id,
      title,
      messages,
      firstName: profile?.firstName,
      lastName: profile?.lastName,
      email: profile?.email,
    });

    step4InFlightRef.current = true;
    void (async () => {
      try {
        const createdId = await createItem(item);
        openEdit(createdId);
      } catch {
        /* retry on next effect pass */
      } finally {
        step4InFlightRef.current = false;
      }
    })();
  }, [
    active,
    bootstrapped,
    canPostToVault,
    createItem,
    items,
    locale,
    markPersonalDataBootstrapDismissed,
    personalDataBootstrapDismissed,
    preferencesReady,
    profile?.email,
    profile?.firstName,
    profile?.lastName,
    searchParams,
    step,
    step4OverlayVisible,
    t,
    userId,
    vaults,
    vaultsListReady,
    workspaceId,
  ]);

  // After step-4 overlay is dismissed, complete the tour when the personal-data popup closes
  // (save and cancel both close the popup).
  useEffect(() => {
    if (!active || step !== 4 || step4OverlayVisible) {
      return;
    }
    const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
    const editOpen =
      activePopup?.popupId === EDIT_ITEM_POPUP_ID &&
      (step4ItemId == null || activePopup.menuItemId === step4ItemId);
    if (!editOpen) {
      void complete();
    }
  }, [active, complete, searchParams, step, step4ItemId, step4OverlayVisible]);

  if (!active) {
    return null;
  }

  // Step 4 after OK: hide tour chrome but keep listening for popup close.
  if (step === 4 && !step4OverlayVisible) {
    return null;
  }

  const copy = stepCopy(step, t);
  const skipLabel = t("web.productTour.skip");

  const handleNext = () => {
    if (isLastProductTourStep(step)) {
      setStep4OverlayVisible(false);
      return;
    }
    const next = nextProductTourStep(step);
    void setStep(next);
  };

  const handleSkip = () => {
    setStep4OverlayVisible(false);
    onAccountMenuOpenChange(false);
    void skip();
  };

  return (
    <ProductTourOverlay
      title={copy.title}
      body={copy.body}
      nextLabel={copy.nextLabel}
      skipLabel={skipLabel}
      anchorSelectors={anchorsForStep(step)}
      fullDim={step === 4}
      onNext={handleNext}
      onSkip={handleSkip}
    />
  );
}
