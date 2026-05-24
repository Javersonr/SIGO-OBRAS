import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const MobileDialog = DialogPrimitive.Root;
const MobileDialogTrigger = DialogPrimitive.Trigger;
const MobileDialogPortal = DialogPrimitive.Portal;
const MobileDialogClose = DialogPrimitive.Close;

const MobileDialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
MobileDialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const MobileDialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <MobileDialogPortal>
    <MobileDialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 bg-white shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out",
        // Mobile: tela cheia
        "inset-0 w-full h-full md:inset-auto",
        // Desktop: centralizado
        "md:left-[50%] md:top-[50%] md:max-h-[85vh] md:w-full md:max-w-lg md:translate-x-[-50%] md:translate-y-[-50%] md:rounded-lg md:border",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:md:zoom-out-95 data-[state=open]:md:zoom-in-95",
        "data-[state=closed]:md:slide-out-to-left-1/2 data-[state=closed]:md:slide-out-to-top-[48%]",
        "data-[state=open]:md:slide-in-from-left-1/2 data-[state=open]:md:slide-in-from-top-[48%]",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground md:hidden">
        <X className="h-6 w-6" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </MobileDialogPortal>
));
MobileDialogContent.displayName = DialogPrimitive.Content.displayName;

const MobileDialogHeader = ({ className, ...props }) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 p-6 pb-4",
      className
    )}
    {...props}
  />
);
MobileDialogHeader.displayName = "MobileDialogHeader";

const MobileDialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-4 border-t",
      className
    )}
    {...props}
  />
);
MobileDialogFooter.displayName = "MobileDialogFooter";

const MobileDialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight pr-8 md:pr-0",
      className
    )}
    {...props}
  />
));
MobileDialogTitle.displayName = DialogPrimitive.Title.displayName;

const MobileDialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
MobileDialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  MobileDialog,
  MobileDialogPortal,
  MobileDialogOverlay,
  MobileDialogClose,
  MobileDialogTrigger,
  MobileDialogContent,
  MobileDialogHeader,
  MobileDialogFooter,
  MobileDialogTitle,
  MobileDialogDescription,
};