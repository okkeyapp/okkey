import * as React from "react";

import { cn } from "../../lib/utils.js";

const filledTileShadow =
  "bg-card shadow-[0px_0px_0px_1px_rgba(0,0,0,0.05),0px_1px_2px_0px_rgba(0,0,0,0.15)] dark:shadow-[0px_0px_0px_1px_rgba(255,255,255,0.22),0px_2px_16px_0px_rgba(255,255,255,0.08),0px_1px_2px_0px_rgba(255,255,255,0.05)]";

const badgeShadow =
  "shadow-[0px_0px_0px_1px_rgba(0,0,0,0.06),0px_1px_2px_rgba(0,0,0,0.12)] dark:shadow-[0px_0px_0px_1px_rgba(255,255,255,0.2),0px_2px_8px_rgba(255,255,255,0.07)]";

function BriefcaseGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden {...props}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  );
}

export type PersonalWorkspaceMarkProps = React.SVGProps<SVGSVGElement> & {
  /** Tile background (e.g. user preference from settings). */
  fillColor: string;
};

/** Vector mark for a personal workspace tile; `fillColor` is applied to the background rect. */
export function PersonalWorkspaceMark({ fillColor, className, ...props }: PersonalWorkspaceMarkProps) {
  return (
    <svg
      width={60}
      height={60}
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      {...props}
    >
      <rect width={60} height={60} fill={fillColor} />
      <path
        d="M46.6244 16.4135L46.472 9.67074C46.7031 8.18518 49.066 8.29257 49.5314 9.86762C50.295 12.4499 49.3216 16.1743 49.2495 18.8542C49.574 18.6297 49.7084 17.9284 49.8214 17.5525C50.041 16.8203 50.5408 13.8085 50.7702 13.5303C51.4634 12.6809 53.4166 13.0698 53.6346 14.256C54.0852 16.721 52.0336 22.9496 50.9636 25.3578C47.8387 32.3967 41.5544 38.1388 33.6823 39.1948C33.7003 39.7106 34.3083 39.7659 34.577 40.1759C35.1506 41.0513 35.0752 44.3332 33.6856 44.8067C34.5639 45.3681 34.7524 45.8969 34.8359 46.9171C34.99 48.798 34.7769 48.9705 33.5217 50.1795C32.514 51.1492 30.7852 52.7519 29.6496 53.4874C29.0187 53.8958 28.4321 53.9658 27.7389 53.6387C27.3243 53.4435 24.7385 50.9833 24.3387 50.5065C24.0339 50.1437 23.7324 49.776 23.5571 49.3301L23.4964 34.2581C19.6046 31.9964 16.2044 28.5713 15.5129 23.9617C13.3696 9.65935 31.9077 2.76036 40.5614 13.7304C40.563 13.9435 38.6409 14.1827 38.3902 14.1111C38.2214 14.064 36.2173 12.2985 35.6356 11.9536C27.8635 7.32931 17.6153 12.5963 18.4461 21.8627C18.8394 26.2527 22.41 29.7201 26.4804 31.0039L26.4919 48.6939C26.5706 49.0795 26.6099 49.4619 26.8688 49.7841C27.0687 50.0314 28.5861 51.2469 28.845 51.2485C29.7807 51.2583 33.0121 48.7232 33.1809 47.729C33.5758 45.4006 31.0637 45.975 30.9048 44.3007C30.7049 42.1903 33.4185 43.3749 33.5316 41.5541C33.6364 39.8668 31.0588 40.2183 30.7672 38.9166L31.0474 31.4936C31.2293 31.2056 33.2612 31.0787 33.82 30.9534C35.7388 30.5206 37.9674 29.546 39.416 28.2101C39.4815 27.8847 39.3422 28.0116 39.2079 27.9335C37.9985 27.2257 36.9744 26.8905 35.9814 25.7678C35.0735 24.7411 33.7954 22.6649 35.6487 21.8692C38.246 20.7547 38.2968 24.0317 40.6466 24.0349C43.6847 24.0398 43.5224 18.903 40.6433 18.6931C38.5721 18.5418 38.9047 20.6391 37.33 20.9402C36.4615 21.1061 35.4045 20.6635 35.1178 19.7882C34.4476 17.7445 37.4856 15.6585 39.1669 15.1102C40.8482 14.5619 42.0247 14.8987 43.5142 15.4421L41.3791 8.0306C41.3381 6.26192 44.0124 5.83562 44.7449 7.46925C45.7428 9.69514 45.9034 13.4115 46.3 15.8505C46.3393 16.093 46.3082 16.3533 46.6277 16.4184L46.6244 16.4135Z"
        fill="white"
      />
      <path
        d="M35.0964 15.4942C35.2209 15.6342 35.4798 15.9694 35.4552 16.1402L34.087 18.2034C33.8412 18.2603 32.9219 17.1523 32.5892 16.9277C30.6032 15.5902 27.7995 15.8018 25.9773 17.3052C21.2137 21.238 26.4902 28.2931 32.3729 25.1203C32.663 24.9641 33.8952 23.9764 34.0067 24.061C34.1509 24.5703 34.4213 25.1268 34.6916 25.5791C34.8703 25.8785 35.4585 26.1763 35.2439 26.5049C35.0734 26.7653 32.8842 27.8294 32.4582 27.971C24.0076 30.7859 17.5284 20.3821 24.5025 14.8645C27.3587 12.6061 32.6204 12.7102 35.0964 15.4942Z"
        fill="white"
      />
    </svg>
  );
}

export type WorkspaceTileProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title"> & {
  /** Primary line (e.g. workspace name). */
  title: string;
  /** Secondary line (e.g. plan label). */
  description: string;
  /**
   * When set, shows the personal mark SVG with this fill.
   * Ignored if `imageSrc` is set (`imageSrc` wins).
   */
  tileColor?: string;
  /** Remote/local image URL for the tile (e.g. org favicon). */
  imageSrc?: string;
  /** `img` alt when `imageSrc` is used; decorative tiles may use `""`. */
  imageAlt?: string;
  /** When true, shows a briefcase badge on the bottom-right of the media. */
  business?: boolean;
};

const WorkspaceTile = React.forwardRef<HTMLButtonElement, WorkspaceTileProps>(
  (
    {
      className,
      title,
      description,
      tileColor,
      imageSrc,
      imageAlt = "",
      business = false,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const showImage = Boolean(imageSrc);
    const showSvg = Boolean(tileColor) && !showImage;

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "flex h-[170px] w-[180px] shrink-0 flex-col items-center justify-center gap-6 rounded-xl p-6 text-card-foreground",
          filledTileShadow,
          "transition-[transform,box-shadow] hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
        {...props}
      >
        <div className="relative size-[60px] shrink-0">
          {showImage ? (
            <img
              src={imageSrc}
              alt={imageAlt}
              width={60}
              height={60}
              decoding="async"
              loading="lazy"
              className="size-[60px] rounded-lg object-cover"
            />
          ) : showSvg ? (
            <div className="size-[60px] overflow-hidden rounded-lg">
              <PersonalWorkspaceMark fillColor={tileColor!} className="block size-full" />
            </div>
          ) : (
            <div className="size-[60px] rounded-lg bg-muted" aria-hidden />
          )}
          {business ? (
            <div
              className={cn(
                "absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-lg bg-card",
                badgeShadow,
              )}
            >
              <BriefcaseGlyph className="size-3.5 text-foreground" />
            </div>
          ) : null}
        </div>
        <div className="flex w-full flex-col items-center gap-0.5 text-center">
          <p className="w-full text-base font-semibold leading-relaxed text-foreground">{title}</p>
          <p className="w-full text-sm font-normal leading-5 text-muted-foreground">{description}</p>
        </div>
      </button>
    );
  },
);
WorkspaceTile.displayName = "WorkspaceTile";

export { WorkspaceTile };
