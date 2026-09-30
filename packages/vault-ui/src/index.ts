export {
  KeyFormEditor,
  type KeyFormEditorSectionVariant,
  type KeyFormSelectOption,
  type KeyFormEditorField,
  type KeyFormEditorSection,
  type KeyFormEditorProps,
  type RecoveryCodesValueChange,
  type KeyFormUrlAutofillScope,
} from "./key-form/KeyFormEditor.js";

export {
  createKeyFormEditorMessages,
  createLocalizedKeyFieldTypes,
  filterKeyFieldTypesForFilesEnabled,
  formatKeyFormMessage,
  englishKeyFormEditorMessages,
  englishKeyFieldTypes,
  type KeyFormEditorMessages,
  type PasswordStrengthLabelKey,
  type CrackTimeLabelKey,
} from "./key-form/keyFormI18n.js";

export {
  resolveKeyFormFieldLabel,
  keyFormFieldLabelKey,
} from "./key-form/keyFormFieldLabel.js";

export {
  isPinField,
  shouldConcealPinField,
  isFixedPasswordField,
  isSecretLikeField,
  isConfigurableSecretField,
  getSecretKind,
  secretFieldShowsStrength,
  isSecretFieldEmpty,
  shouldConcealSecretField,
  shouldOpenGeneratorOnFocus,
  showSecretLabelKey,
  type KeyFormSecretFieldLike,
} from "./key-form/keyFormSecretField.js";

export { createInitialKeyFormSections } from "./key-form/createInitialKeyFormSections.js";

export {
  itemPlaintextToKeyFormSections,
  type ItemPlaintextToKeyFormSectionsOptions,
} from "./items/itemPlaintextToKeyFormSections.js";

export { keyFormSectionsToItemPlaintext } from "./items/keyFormToItemPlaintext.js";

export {
  isKeyFormFieldFilled,
  isItemFieldFilled,
  filterFilledKeyFormSections,
} from "./items/keyFormFilledFields.js";

export {
  normalizeSelectOptionsEditorText,
  appendSelectOptionsEditorLineAtEnd,
  serializeSelectFieldValue,
  parseSelectFieldValueFromItem,
  selectFieldValueFromRaw,
  type SelectFieldValueRaw,
} from "./items/keyFormSelectField.js";

export {
  isCreditCardRequiredFieldEmpty,
  isInvalidCreditCardRequiredField,
} from "./items/creditCardFormValidation.js";

export {
  hasFilledPersonalDataNameField,
  isInvalidPersonalDataNameField,
  appendPersonalDataNameIssues,
  type PersonalDataFieldValidationIssue,
} from "./items/personalDataFormValidation.js";

export {
  estimatePasswordCrackTimeKey,
  getPasswordStrength,
  getPasswordEntropyBits,
  passwordStrengthTextClassName,
  toMonitoringStrengthBucket,
  type PasswordStrength,
  type MonitoringStrengthBucket,
} from "./lib/passwordStrength.js";

export {
  ITEM_CATEGORY_GROUP_PERSONAL,
  ITEM_CATEGORY_GROUP_AUTHORIZATION,
  ITEM_CATEGORY_GROUP_FINANCE,
  ITEM_CATEGORY_GROUPS,
  ITEM_CATEGORY_DEFINITIONS,
  DEFAULT_FAVORITE_CATEGORY_IDS,
  getItemCategoryDefinition,
  isItemCategoryId,
  categoriesForGroup,
  filterItemCategoriesForFilesEnabled,
  sortCategoriesByFavoriteOrder,
  itemCategoryIdToPopupSlug,
  popupSlugToItemCategoryId,
  type ItemCategoryGroupId,
  type ItemCategoryId,
  type ItemCategoryDefinition,
} from "./items/itemCategoryCatalog.js";

export {
  API_ACCESS_SECTION_ID,
  DATABASE_SECTION_ID,
  SERVER_SECTION_ID,
  SERVER_ADMIN_CONSOLE_SECTION_ID,
  WIFI_ROUTER_SECTION_ID,
  CREDIT_CARD_SECTION_ID,
  BANK_ACCOUNT_SECTION_ID,
  BANK_DETAILS_SECTION_ID,
  CRYPTO_WALLET_SECTION_ID,
  CRYPTO_WALLET_WALLET_SECTION_ID,
  PERSONAL_DATA_SECTION_ID,
  PERSONAL_DATA_WORK_SECTION_ID,
  PASSPORT_SECTION_ID,
  SECURE_FILES_SECTION_ID,
  SECURE_NOTE_SECTION_ID,
  getDefaultSectionsForCategory,
  enrichCategoryPresetSelectField,
  getAllApiAccessPresetFields,
  getAllCreditCardPresetFields,
  getAllDatabasePresetFields,
  getAllPassportPresetFields,
  getAllPersonalDataPrimaryPresetFields,
  getAllSecureFilesPresetFields,
  getAllSecureNotePresetFields,
  getAllWifiRouterPresetFields,
  isCreditCardRequiredFieldId,
  isCreditCardPresetSection,
  isFlexiblePresetPrimarySection,
  isPersonalDataPresetFieldId,
  isPersonalDataPresetSection,
  isPersonalDataRequiredNameFieldId,
  isPassportPresetFieldId,
  isPassportPresetSection,
  isSecureFilesPresetSection,
  isSecureNotePresetSection,
} from "./items/itemCategoryDefaultSections.js";

export {
  ItemCategoryIcon,
  BackChevronIcon,
  ReorderIcon,
  DoneIcon,
  StarIcon,
  IconActions16,
  IconUpdateTemplate16,
  IconSaveTemplate16,
  IconEdit16,
  IconDelete16,
  IconCheck16,
  IconUnlock16,
  IconNotNow16,
  type CategoryIconPixelSize,
} from "./items/itemCategoryIcons.js";

export { default as ItemRecordFavicon, isLoginItemCategory, LazyItemRecordFavicon } from "./items/ItemRecordFavicon.js";

export {
  ItemRecordFaviconField,
  ItemRecordFaviconUploadControl,
} from "./items/ItemRecordFaviconField.js";

export {
  CategoryIconBadge,
  FilterTagsIcon,
  ItemsListFilterScopeSubmenus,
  getActiveCategoryLabel,
  type ItemsListFilterScopeRecord,
  type ItemsListFilterScopeSubmenusProps,
  type ItemsListFilterScopeVault,
} from "./filter/ItemsListFilterScopeSubmenus.js";

export {
  ItemsListFilterDropdown,
  ScopeRowCloseButton,
  isItemsListMonitoringFilter,
  type ItemsListCoreFilter,
  type ItemsListFilterDropdownProps,
  type ItemsListFilterValue,
  type ItemsListMonitoringFilter,
} from "./filter/ItemsListFilterDropdown.js";

export { useItemFaviconAttachmentUrl } from "./items/useItemFaviconAttachmentUrl.js";
export { useWorkspaceLogoUrl } from "./items/useWorkspaceLogoUrl.js";

export {
  buildItemActivityEntries,
  enrichItemActivityWithItemTimestamps,
  mapItemActivityWireEntries,
  resolveItemUpdateActivityKey,
  type ItemActivityActionKey,
  type ItemActivityEntry,
  type ItemActivityWireEntry,
} from "./items/buildItemActivityEntries.js";

export { default as ItemActivitySection, type ItemActivitySectionProps } from "./items/ItemActivitySection.js";
export { default as ItemDetailSavePath, type ItemDetailSavePathProps } from "./items/ItemDetailSavePath.js";
export {
  formatUserLocalDateParts,
  resolveUserTimeZone,
  type FormatUserLocalDateTimeOptions,
} from "./lib/formatUserLocalDateTime.js";
