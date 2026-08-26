import {
  SettingsFieldDividerSkeleton,
  SettingsFieldRowSkeleton,
  SettingsPageIntroSkeleton,
  SettingsSkeletonShell,
} from "./settingsSkeletonPrimitives";

type WorkspaceSettingsCapsulesSkeletonProps = {
  label?: string;
  className?: string;
};

/**
 * Loading placeholder for Capsules settings policies (default allow mode, no member picker).
 */
export default function WorkspaceSettingsCapsulesSkeleton({
  label,
  className,
}: WorkspaceSettingsCapsulesSkeletonProps) {
  return (
    <SettingsSkeletonShell label={label} className={className}>
      <SettingsPageIntroSkeleton titleWidthClass="w-28" />
      <div className="flex flex-col">
        <SettingsFieldRowSkeleton
          control="select"
          labelWidthClass="w-48"
          descriptionWidthClass="w-full max-w-lg"
        />
        <SettingsFieldDividerSkeleton />
        <SettingsFieldRowSkeleton
          control="input"
          labelWidthClass="w-52"
          descriptionWidthClass="w-full max-w-md"
        />
        <SettingsFieldDividerSkeleton />
        <SettingsFieldRowSkeleton
          control="switch"
          labelWidthClass="w-56"
          descriptionWidthClass="w-full max-w-sm"
        />
        <SettingsFieldDividerSkeleton />
        <SettingsFieldRowSkeleton
          control="switch"
          labelWidthClass="w-44"
          descriptionWidthClass="w-full max-w-md"
        />
        <SettingsFieldDividerSkeleton />
        <SettingsFieldRowSkeleton
          control="select"
          labelWidthClass="w-40"
          descriptionWidthClass="w-full max-w-sm"
        />
        <SettingsFieldDividerSkeleton />
        <SettingsFieldRowSkeleton
          control="switch"
          labelWidthClass="w-48"
          descriptionWidthClass="w-full max-w-md"
        />
        <SettingsFieldDividerSkeleton />
        <SettingsFieldRowSkeleton
          control="input"
          labelWidthClass="w-60"
          descriptionWidthClass="w-full max-w-lg"
        />
        <SettingsFieldDividerSkeleton />
        <SettingsFieldRowSkeleton
          control="switch"
          labelWidthClass="w-52"
          descriptionWidthClass="w-full max-w-md"
        />
      </div>
    </SettingsSkeletonShell>
  );
}
