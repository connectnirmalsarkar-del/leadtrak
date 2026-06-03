import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

const Toaster = ({
  ...props
}) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      // Push toasts BELOW the iOS notch / Android status bar via env() safe-area.
      // We use sonner's `offset` and `mobileOffset` props which compute spacing
      // from the chosen position edge — pass calc() with env() for safe areas.
      offset={{
        top: 'calc(16px + env(safe-area-inset-top, 0px))',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: 'calc(16px + env(safe-area-inset-left, 0px))',
        right: 'calc(16px + env(safe-area-inset-right, 0px))',
      }}
      mobileOffset={{
        top: 'calc(16px + env(safe-area-inset-top, 0px))',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: 'calc(16px + env(safe-area-inset-left, 0px))',
        right: 'calc(16px + env(safe-area-inset-right, 0px))',
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />
  );
}

export { Toaster, toast }
