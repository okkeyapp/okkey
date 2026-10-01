import { Spinner, cn } from "@okkey/ui";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function ToastSuccessIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn("size-4 shrink-0 text-green-600 dark:text-green-500", className)}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.25 8.1L7.1 9.95L10.85 6.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ToastErrorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn("size-4 shrink-0 text-destructive", className)}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.6 5.6L10.4 10.4M10.4 5.6L5.6 10.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const toastIcons: NonNullable<ToasterProps["icons"]> = {
  loading: (
    <Spinner size="small" className="size-4 [&_circle:last-of-type]:stroke-primary [&_path]:stroke-primary" />
  ),
  success: <ToastSuccessIcon />,
  error: <ToastErrorIcon />,
};

/** Extension toaster — top-center so auth forms do not stretch for inline alerts. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      position="top-center"
      icons={toastIcons}
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            "group toast !w-auto !min-w-0 !max-w-[min(320px,calc(100vw-24px))] !whitespace-normal break-words [overflow-wrap:break-word] !px-3 !py-2 !gap-2 group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-md",
          title: "whitespace-normal break-words text-sm leading-5 text-foreground",
          description: "whitespace-normal break-words text-xs leading-4 text-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          icon: "text-inherit !size-4",
        },
      }}
      {...props}
    />
  );
}
