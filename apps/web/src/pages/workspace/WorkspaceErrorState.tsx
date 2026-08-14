import { Button } from "@okkey/ui";
import { Link, useSearchParams } from "react-router-dom";

import { BackChevronIcon } from "../../components/items/itemCategoryIcons";
import { useLocale } from "../../locale/LocaleContext";
import { itemsPathAllWorkspaceMerged } from "../../routes/paths";

type WorkspaceErrorStateProps = {
  titleKey: string;
  descriptionKey: string;
};

export default function WorkspaceErrorState({ titleKey, descriptionKey }: WorkspaceErrorStateProps) {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();

  return (
    <div className="flex h-full min-h-full w-full flex-1 flex-col items-center justify-center self-stretch px-4 py-8">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex flex-col items-center gap-1">
          <p className="text-lg font-semibold leading-7 text-foreground">{t(titleKey)}</p>
          <p className="text-sm leading-5 text-muted-foreground">{t(descriptionKey)}</p>
        </div>
        <Button asChild variant="secondary">
          <Link to={itemsPathAllWorkspaceMerged(searchParams)} className="inline-flex items-center gap-2">
            <BackChevronIcon className="size-4 shrink-0" />
            {t("web.nav.allItems")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
