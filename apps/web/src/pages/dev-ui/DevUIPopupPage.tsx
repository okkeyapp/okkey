import type { ReactNode, SVGProps } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Popup, type PopupMenu } from "@okkey/ui";

function PopupDemoSettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function PopupDemoShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function PopupDemoKeyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}

function PopupDemoDeviceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect width="14" height="10" x="5" y="3" rx="2" />
      <rect width="8" height="10" x="8" y="11" rx="2" />
      <path d="M12 17h.01" />
    </svg>
  );
}

const POPUP_QUERY_PARAM = "popup";
const SETTINGS_POPUP_ID = "settings";
const CAPSULE_POPUP_ID = "capsule";
const VAULT_POPUP_ID = "vault";
const DEFAULT_SETTINGS_MENU_ITEM_ID = "main";

const settingsMenuItems = [
  { id: "main", label: "Основное", icon: <PopupDemoSettingsIcon className="size-4" /> },
  { id: "vault", label: "Хранилище", icon: <PopupDemoShieldIcon className="size-4" /> },
  { id: "login", label: "Методы входа", icon: <PopupDemoKeyIcon className="size-4" /> },
  { id: "devices", label: "Устройства", icon: <PopupDemoDeviceIcon className="size-4" /> },
] as const;

const settingsContentByItemId: Record<string, { heading: string; description: string }> = {
  main: {
    heading: "Основные настройки",
    description: "Имя, фамилия, email, язык, регион, тема оформления и акцентный цвет.",
  },
  vault: {
    heading: "Настройки хранилища",
    description: "Автоблокировка, очистка буфера обмена, смена мастер-пароля и приватные разделы.",
  },
  login: {
    heading: "Настройки методов входа",
    description: "Email-код, passkey, аппаратные ключи и выбор основного метода входа.",
  },
  devices: {
    heading: "Настройки устройств",
    description: "Список доверенных устройств, названия, платформы и последняя активность.",
  },
};

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

function PopupDemoCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SettingsPopupContent({ activeItemId }: { activeItemId: string }) {
  const content = settingsContentByItemId[activeItemId] ?? settingsContentByItemId[DEFAULT_SETTINGS_MENU_ITEM_ID];

  return (
    <div className="min-h-[420px] space-y-3">
      <h3 className="text-base font-medium">{content.heading}</h3>
      <p className="max-w-prose text-sm text-muted-foreground">{content.description}</p>
      <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Активный пункт меню:{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">{activeItemId}</code>
      </div>
    </div>
  );
}

export default function DevUIPopupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const activeSettingsMenuItemId =
    activePopup?.popupId === SETTINGS_POPUP_ID &&
    activePopup.menuItemId &&
    settingsMenuItems.some((item) => item.id === activePopup.menuItemId)
      ? activePopup.menuItemId
      : DEFAULT_SETTINGS_MENU_ITEM_ID;
  const activeSettingsContent =
    settingsContentByItemId[activeSettingsMenuItemId] ?? settingsContentByItemId[DEFAULT_SETTINGS_MENU_ITEM_ID];

  function setPopupQuery(popupId: string, menuItemId?: string) {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(popupId, menuItemId)),
        hash: location.hash,
      },
      { replace: false },
    );
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

  const settingsMenu: PopupMenu = {
    label: "Мои настройки",
    activeItemId: activeSettingsMenuItemId,
    items: settingsMenuItems,
    onItemSelect: (item) => setPopupQuery(SETTINGS_POPUP_ID, item.id),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Popup</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Centered popup with optional footer and sidebar menu. Body content is wrapped in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">ScrollArea</code>; mobile layout becomes a bottom sheet,
            and menu switches to a dropdown above the header.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <PopupDemoCard
            title="Footer, no menu"
            description={`Writes ?${POPUP_QUERY_PARAM}=${CAPSULE_POPUP_ID} and shows footer actions.`}
          >
            <Button type="button" onClick={() => setPopupQuery(CAPSULE_POPUP_ID)}>
              Open capsule popup
            </Button>
          </PopupDemoCard>

          <PopupDemoCard
            title="Menu, no footer"
            description={`Writes ?${POPUP_QUERY_PARAM}=${SETTINGS_POPUP_ID}|${DEFAULT_SETTINGS_MENU_ITEM_ID}.`}
          >
            <Button type="button" onClick={() => setPopupQuery(SETTINGS_POPUP_ID, DEFAULT_SETTINGS_MENU_ITEM_ID)}>
              Open settings popup
            </Button>
          </PopupDemoCard>

          <PopupDemoCard
            title="Custom header"
            description={`Writes ?${POPUP_QUERY_PARAM}=${VAULT_POPUP_ID}; footer and menu are omitted.`}
          >
            <Button type="button" onClick={() => setPopupQuery(VAULT_POPUP_ID)}>
              Open vault popup
            </Button>
          </PopupDemoCard>
        </div>

        {activePopup?.popupId === CAPSULE_POPUP_ID ? (
          <Popup
            id={CAPSULE_POPUP_ID}
            header="Новая капсула"
            description="Настройте содержимое и ограничения доступа перед созданием ссылки."
            closeLabel="Закрыть"
            onClose={closePopup}
            footer={
              <>
                <Button type="button" variant="outline" onClick={closePopup}>
                  Отмена
                </Button>
                <Button type="button">Сохранить</Button>
              </>
            }
          >
            <div className="min-h-[420px]" aria-label="Capsule popup content" />
          </Popup>
        ) : null}

        {activePopup?.popupId === SETTINGS_POPUP_ID ? (
          <Popup
            id={SETTINGS_POPUP_ID}
            width={800}
            header={activeSettingsContent.heading}
            description={activeSettingsContent.description}
            menu={settingsMenu}
            closeLabel="Закрыть"
            onClose={closePopup}
          >
            <SettingsPopupContent activeItemId={activeSettingsMenuItemId} />
          </Popup>
        ) : null}

        {activePopup?.popupId === VAULT_POPUP_ID ? (
          <Popup
            id={VAULT_POPUP_ID}
            width={560}
            header={
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold leading-7 text-foreground">Карточка сейфа</h3>
              </div>
            }
            description={
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm leading-5 text-muted-foreground">
                Настройки доступа и видимости
              </div>
            }
            closeLabel="Закрыть"
            onClose={closePopup}
          >
            <div className="min-h-[260px] text-sm text-muted-foreground">
              Header accepts a React node, while footer and menu are optional.
            </div>
          </Popup>
        ) : null}
      </section>
    </div>
  );
}
