import {
  SettingsFieldDividerSkeleton,
  SettingsFieldRowSkeleton,
  SettingsPageIntroSkeleton,
  SettingsSkeletonShell,
} from "./settingsSkeletonPrimitives";

type WorkspaceSettingsItemsSkeletonProps = {
  label?: string;
  className?: string;
};

/**
 * Loading placeholder for Items settings (retention + files toggle; files off).
 */
export default function WorkspaceSettingsItemsSkeleton({
  label,
  className,
}: WorkspaceSettingsItemsSkeletonProps) {
  return (
    <SettingsSkeletonShell label={label} className={className}>
      <SettingsPageIntroSkeleton titleWidthClass="w-24" />
      <div className="flex flex-col">
        <SettingsFieldRowSkeleton
          control="select"
          labelWidthClass="w-56"
          descriptionWidthClass="w-full max-w-md"
        />
        <SettingsFieldDividerSkeleton />
        <SettingsFieldRowSkeleton
          control="switch"
          labelWidthClass="w-52"
          descriptionWidthClass="w-full max-w-sm"
        />
      </div>
    </SettingsSkeletonShell>
  );
}
