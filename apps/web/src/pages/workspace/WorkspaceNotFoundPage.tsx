import { Button } from "@okkey/ui";
import { Link, useSearchParams } from "react-router-dom";

import { useLocale } from "../../locale/LocaleContext";
import { itemsPathAllWorkspaceMerged } from "../../routes/paths";

export default function WorkspaceNotFoundPage() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-8">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex flex-col items-center gap-1">
          <p className="text-lg font-semibold leading-7 text-foreground">{t("web.notFound.title")}</p>
          <p className="text-sm leading-5 text-muted-foreground">{t("web.notFound.description")}</p>
        </div>
        <Button asChild variant="secondary">
          <Link to={itemsPathAllWorkspaceMerged(searchParams)}>{t("web.nav.allItems")}</Link>
        </Button>
      </div>
    </div>
  );
}
