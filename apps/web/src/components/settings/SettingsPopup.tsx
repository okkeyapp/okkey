import { Popup, type PopupMenu } from "@okkey/ui";
import type { ReactNode, SVGProps } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import type { WebMessageValues } from "@okkey/i18n";
import SettingsGeneralContent from "./SettingsGeneralContent";

const POPUP_QUERY_PARAM = "popup";
const SETTINGS_POPUP_ID = "settings";

export type SettingsPopupItemId = "main" | "vault" | "login" | "twoFactor" | "recovery" | "devices";

const DEFAULT_SETTINGS_POPUP_ITEM_ID: SettingsPopupItemId = "main";

type SettingsPopupProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  children: (controls: { openSettingsPopup: () => void }) => ReactNode;
};

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M8.14667 1.33325H7.85333C7.49971 1.33325 7.16057 1.47373 6.91053 1.72378C6.66048 1.97382 6.52 2.31296 6.52 2.66659V2.78659C6.51976 3.0204 6.45804 3.25005 6.34103 3.45248C6.22401 3.65491 6.05583 3.82301 5.85333 3.93992L5.56667 4.10659C5.36398 4.22361 5.13405 4.28522 4.9 4.28522C4.66595 4.28522 4.43603 4.22361 4.23333 4.10659L4.13333 4.05325C3.82738 3.87676 3.46389 3.82888 3.12267 3.92012C2.78145 4.01137 2.49037 4.23428 2.31333 4.53992L2.16667 4.79325C1.99018 5.09921 1.9423 5.46269 2.03354 5.80392C2.12478 6.14514 2.34769 6.43622 2.65333 6.61325L2.75333 6.67992C2.95485 6.79626 3.12241 6.96331 3.23937 7.16447C3.35632 7.36563 3.4186 7.5939 3.42 7.82658V8.16658C3.42093 8.40153 3.35977 8.63255 3.2427 8.83626C3.12563 9.03996 2.95681 9.20911 2.75333 9.32658L2.65333 9.38658C2.34769 9.56362 2.12478 9.8547 2.03354 10.1959C1.9423 10.5371 1.99018 10.9006 2.16667 11.2066L2.31333 11.4599C2.49037 11.7656 2.78145 11.9885 3.12267 12.0797C3.46389 12.171 3.82738 12.1231 4.13333 11.9466L4.23333 11.8933C4.43603 11.7762 4.66595 11.7146 4.9 11.7146C5.13405 11.7146 5.36398 11.7762 5.56667 11.8933L5.85333 12.0599C6.05583 12.1768 6.22401 12.3449 6.34103 12.5474C6.45804 12.7498 6.51976 12.9794 6.52 13.2133V13.3333C6.52 13.6869 6.66048 14.026 6.91053 14.2761C7.16057 14.5261 7.49971 14.6666 7.85333 14.6666H8.14667C8.50029 14.6666 8.83943 14.5261 9.08948 14.2761C9.33953 14.026 9.48 13.6869 9.48 13.3333V13.2133C9.48024 12.9794 9.54196 12.7498 9.65898 12.5474C9.77599 12.3449 9.94418 12.1768 10.1467 12.0599L10.4333 11.8933C10.636 11.7762 10.866 11.7146 11.1 11.7146C11.3341 11.7146 11.564 11.7762 11.7667 11.8933L11.8667 11.9466C12.1726 12.1231 12.5361 12.171 12.8773 12.0797C13.2186 11.9885 13.5096 11.7656 13.6867 11.4599L13.8333 11.1999C14.0098 10.894 14.0577 10.5305 13.9665 10.1893C13.8752 9.84803 13.6523 9.55695 13.3467 9.37992L13.2467 9.32658C13.0432 9.20911 12.8744 9.03996 12.7573 8.83626C12.6402 8.63255 12.5791 8.40153 12.58 8.16658V7.83325C12.5791 7.5983 12.6402 7.36728 12.7573 7.16358C12.8744 6.95988 13.0432 6.79072 13.2467 6.67325L13.3467 6.61325C13.6523 6.43622 13.8752 6.14514 13.9665 5.80392C14.0577 5.46269 14.0098 5.09921 13.8333 4.79325L13.6867 4.53992C13.5096 4.23428 13.2186 4.01137 12.8773 3.92012C12.5361 3.82888 12.1726 3.87676 11.8667 4.05325L11.7667 4.10659C11.564 4.22361 11.3341 4.28522 11.1 4.28522C10.866 4.28522 10.636 4.22361 10.4333 4.10659L10.1467 3.93992C9.94418 3.82301 9.77599 3.65491 9.65898 3.45248C9.54196 3.25005 9.48024 3.0204 9.48 2.78659V2.66659C9.48 2.31296 9.33953 1.97382 9.08948 1.72378C8.83943 1.47373 8.50029 1.33325 8.14667 1.33325Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 9.99992C9.10457 9.99992 10 9.10449 10 7.99992C10 6.89535 9.10457 5.99992 8 5.99992C6.89543 5.99992 6 6.89535 6 7.99992C6 9.10449 6.89543 9.99992 8 9.99992Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M5.99996 8L7.33329 9.33333L9.99996 6.66667M13.3333 8.66664C13.3333 12 11 13.6666 8.22663 14.6333C8.0814 14.6825 7.92365 14.6802 7.77996 14.6266C4.99996 13.6666 2.66663 12 2.66663 8.66664V3.99997C2.66663 3.82316 2.73686 3.65359 2.86189 3.52857C2.98691 3.40355 3.15648 3.33331 3.33329 3.33331C4.66663 3.33331 6.33329 2.53331 7.49329 1.51997C7.63453 1.39931 7.8142 1.33301 7.99996 1.33301C8.18572 1.33301 8.36539 1.39931 8.50663 1.51997C9.67329 2.53997 11.3333 3.33331 12.6666 3.33331C12.8434 3.33331 13.013 3.40355 13.138 3.52857C13.2631 3.65359 13.3333 3.82316 13.3333 3.99997V8.66664Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoginMethodsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M8 11.3333V13.9999" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6665 13.3333L9.33317 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6665 12L9.33317 13.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.3335 11.3333V13.9999" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 13.3333L4.66667 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12L4.66667 13.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6665 11.3333V13.9999" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.3335 13.3333L14.0002 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.3335 12L14.0002 13.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6 4C6 4.53043 6.21071 5.03914 6.58579 5.41421C6.96086 5.78929 7.46957 6 8 6C8.53043 6 9.03914 5.78929 9.41421 5.41421C9.78929 5.03914 10 4.53043 10 4C10 3.46957 9.78929 2.96086 9.41421 2.58579C9.03914 2.21071 8.53043 2 8 2C7.46957 2 6.96086 2.21071 6.58579 2.58579C6.21071 2.96086 6 3.46957 6 4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.6665 9.33333C4.6665 8.97971 4.80698 8.64057 5.05703 8.39052C5.30708 8.14048 5.64622 8 5.99984 8H9.99984C10.3535 8 10.6926 8.14048 10.9426 8.39052C11.1927 8.64057 11.3332 8.97971 11.3332 9.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TwoFactorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M4.66667 10.6666H2L4.31333 7.55989C4.4554 7.40372 4.55835 7.21604 4.61371 7.01231C4.66907 6.80858 4.67526 6.59461 4.63177 6.38801C4.58828 6.18142 4.49635 5.98811 4.36355 5.82398C4.23075 5.65986 4.06087 5.52962 3.8679 5.44397C3.67493 5.35833 3.46438 5.31974 3.25358 5.33137C3.04277 5.343 2.83775 5.40453 2.65537 5.51088C2.47299 5.61723 2.31848 5.76537 2.20454 5.94311C2.0906 6.12085 2.0205 6.3231 2 6.53323"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.6665 10.6666V5.33325H9.33317" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6665 8H8.6665" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M11.3335 10.6666V6.66659C11.3335 6.31296 11.474 5.97383 11.724 5.72378C11.9741 5.47373 12.3132 5.33325 12.6668 5.33325C13.0205 5.33325 13.3596 5.47373 13.6096 5.72378C13.8597 5.97383 14.0002 6.31296 14.0002 6.66659V10.6666"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.3335 8.66675H14.0002" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RecoveryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M4.5 6.40383V4.57049C4.50003 3.83674 4.74217 3.1235 5.18886 2.54138C5.63556 1.95926 6.26184 1.5408 6.97059 1.35089C7.67934 1.16098 8.43095 1.21023 9.10886 1.49101C9.78677 1.77178 10.3531 2.2684 10.72 2.90383M8.66667 10.6667C8.66667 11.0349 8.36819 11.3334 8 11.3334C7.63181 11.3334 7.33333 11.0349 7.33333 10.6667C7.33333 10.2985 7.63181 10 8 10C8.36819 10 8.66667 10.2985 8.66667 10.6667ZM3.83333 6.50003H12.1667C12.903 6.50003 13.5 7.09698 13.5 7.83336V13.1667C13.5 13.9031 12.903 14.5 12.1667 14.5H3.83333C3.09695 14.5 2.5 13.9031 2.5 13.1667V7.83336C2.5 7.09698 3.09695 6.50003 3.83333 6.50003Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DevicesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M8.5 6.16667C8.5 5.98986 8.57902 5.82029 8.71967 5.69526C8.86032 5.57024 9.05109 5.5 9.25 5.5H13.75C13.9489 5.5 14.1397 5.57024 14.2803 5.69526C14.421 5.82029 14.5 5.98986 14.5 6.16667V12.8333C14.5 13.0101 14.421 13.1797 14.2803 13.3047C14.1397 13.4298 13.9489 13.5 13.75 13.5H9.25C9.05109 13.5 8.86032 13.4298 8.71967 13.3047C8.57902 13.1797 8.5 13.0101 8.5 12.8333V6.16667Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 5.33334V3.16667C11.5 2.98986 11.4298 2.82029 11.3047 2.69526C11.1797 2.57024 11.0101 2.5 10.8333 2.5L3.16667 2.5C2.98986 2.5 2.82029 2.57024 2.69526 2.69526C2.57024 2.82029 2.5 2.98986 2.5 3.16667V11.8333C2.5 12.0101 2.57024 12.1797 2.69526 12.3047C2.82029 12.4298 2.98986 12.5 3.16667 12.5L8 12.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 6H12.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 3H8.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function isSettingsPopupItemId(itemId: string): itemId is SettingsPopupItemId {
  return ["main", "vault", "login", "twoFactor", "recovery", "devices"].includes(itemId);
}

function parsePopupQueryValue(value: string | null): { popupId: string; menuItemId?: string } | null {
  if (!value) {
    return null;
  }

  const [popupId, menuItemId] = value.split("|");
  if (!popupId) {
    return null;
  }

  return { popupId, menuItemId };
}

function buildPopupQueryValue(popupId: string, menuItemId?: string): string {
  return menuItemId ? `${popupId}|${menuItemId}` : popupId;
}

function popupQuerySearch(currentSearch: string, value: string | null): string {
  const params = new URLSearchParams(currentSearch);
  params.delete(POPUP_QUERY_PARAM);
  const baseSearch = params.toString();

  if (!value) {
    return baseSearch ? `?${baseSearch}` : "";
  }

  const popupSearch = `${POPUP_QUERY_PARAM}=${encodeURIComponent(value).replaceAll("%7C", "|")}`;
  return baseSearch ? `?${baseSearch}&${popupSearch}` : `?${popupSearch}`;
}

export default function SettingsPopup({ t, children }: SettingsPopupProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const open = activePopup?.popupId === SETTINGS_POPUP_ID;
  const activeItemId =
    open && activePopup.menuItemId && isSettingsPopupItemId(activePopup.menuItemId)
      ? activePopup.menuItemId
      : DEFAULT_SETTINGS_POPUP_ITEM_ID;

  function setPopupQuery(popupId: string, menuItemId?: SettingsPopupItemId) {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(popupId, menuItemId)),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function openSettingsPopup() {
    setPopupQuery(SETTINGS_POPUP_ID, DEFAULT_SETTINGS_POPUP_ITEM_ID);
  }

  function closePopup() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  const menuItems = [
    { id: "main", label: t("web.settingsPopup.main.label"), icon: <SettingsIcon className="size-4" /> },
    { id: "vault", label: t("web.settingsPopup.vault.label"), icon: <ShieldIcon className="size-4" /> },
    { id: "login", label: t("web.settingsPopup.login.label"), icon: <LoginMethodsIcon className="size-4" /> },
    { id: "twoFactor", label: t("web.settingsPopup.twoFactor.label"), icon: <TwoFactorIcon className="size-4" /> },
    { id: "recovery", label: t("web.settingsPopup.recovery.label"), icon: <RecoveryIcon className="size-4" /> },
    { id: "devices", label: t("web.settingsPopup.devices.label"), icon: <DevicesIcon className="size-4" /> },
  ] as const;
  const headingByItemId: Record<SettingsPopupItemId, string> = {
    main: t("web.settingsPopup.main.title"),
    vault: t("web.settingsPopup.vault.title"),
    login: t("web.settingsPopup.login.title"),
    twoFactor: t("web.settingsPopup.twoFactor.title"),
    recovery: t("web.settingsPopup.recovery.title"),
    devices: t("web.settingsPopup.devices.title"),
  };
  const heading = headingByItemId[activeItemId] ?? headingByItemId[DEFAULT_SETTINGS_POPUP_ITEM_ID];
  const menu: PopupMenu = {
    label: t("web.settingsPopup.menuLabel"),
    activeItemId,
    items: menuItems,
    onItemSelect: (item) => {
      if (isSettingsPopupItemId(item.id)) {
        setPopupQuery(SETTINGS_POPUP_ID, item.id);
      }
    },
  };

  return (
    <>
      {children({ openSettingsPopup })}
      {open ? (
        <Popup
          id="settings"
          width={800}
          header={heading}
          menu={menu}
          closeLabel={t("web.settingsPopup.close")}
          onClose={closePopup}
        >
          {activeItemId === "main" ? (
            <SettingsGeneralContent t={t} />
          ) : (
            <div className="min-h-[420px]" aria-label={heading} />
          )}
        </Popup>
      ) : null}
    </>
  );
}
