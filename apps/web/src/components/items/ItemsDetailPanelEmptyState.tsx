import type { ReactNode } from "react";

type ItemsDetailPanelEmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export default function ItemsDetailPanelEmptyState({ title, description, action }: ItemsDetailPanelEmptyStateProps) {
  return (
    <div data-items-detail-empty className="flex max-w-sm flex-col items-center gap-4 text-center">
      <div className="flex flex-col items-center gap-1">
        <p className="text-lg font-semibold leading-7 text-foreground">{title}</p>
        <p className="text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ItemsDetailPanelEmptyStateFill({ title, description, action }: ItemsDetailPanelEmptyStateProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-4 py-8">
      <ItemsDetailPanelEmptyState title={title} description={description} action={action} />
    </div>
  );
}
