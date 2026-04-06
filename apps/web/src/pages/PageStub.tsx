import { Link } from "react-router-dom";

import AppShellLayout from "../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../components/app-shell/OkkeyLogoMark";

export type PageStubProps = {
  title: string;
  description: string;
  /** Shown as monospace hint in dev, e.g. auth/email */
  pathLabel: string;
};

export default function PageStub({ title, description, pathLabel }: PageStubProps) {
  return (
    <AppShellLayout
      title={title}
      description={description}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        {import.meta.env.DEV ? (
          <p className="okkey-small font-mono text-copy-secondary">/{pathLabel}</p>
        ) : null}
        <p className="okkey-body text-copy-secondary" data-testid="page-stub-notice">
          Placeholder — flow not implemented yet.
        </p>
        {import.meta.env.DEV ? (
          <Link to="/" className="okkey-body font-medium text-primary hover:underline">
            Back to home
          </Link>
        ) : null}
      </div>
    </AppShellLayout>
  );
}
