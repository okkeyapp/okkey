import { cn } from "@okkey/ui";

type PrivacyPolicyHtmlProps = {
  html: string;
  className?: string;
};

/** Renders a full privacy-policy HTML document fragment under the shell logo/title. */
export default function PrivacyPolicyHtml({ html, className }: PrivacyPolicyHtmlProps) {
  return (
    <article
      data-testid="privacy-policy-body"
      className={cn(
        "flex w-full flex-col gap-8 text-left text-copy-secondary",
        "[&_h2]:okkey-body-strong [&_h2]:mb-3 [&_h2]:text-copy-primary",
        "[&_p]:okkey-body [&_p]:mb-3 [&_p:last-child]:mb-0",
        "[&_section]:flex [&_section]:flex-col",
        "[&_ul]:okkey-body [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:ps-5",
        "[&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-copy-primary",
        className,
      )}
      // Trusted static HTML authored in-repo (not user input / not env-interpolated).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
