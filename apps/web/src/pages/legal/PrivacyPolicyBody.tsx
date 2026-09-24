export type PrivacyPolicySection = {
  title: string;
  paragraphs: readonly string[];
};

export type PrivacyPolicyBodyProps = {
  sections: readonly PrivacyPolicySection[];
};

/** Renders structured privacy-policy sections under the shell logo/title. */
export default function PrivacyPolicyBody({ sections }: PrivacyPolicyBodyProps) {
  return (
    <article className="flex w-full flex-col gap-8 text-left" data-testid="privacy-policy-body">
      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-3">
          <h2 className="okkey-body-strong text-copy-primary">{section.title}</h2>
          {section.paragraphs.map((paragraph, index) => (
            <p key={`${section.title}-${index}`} className="okkey-body text-copy-secondary">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
