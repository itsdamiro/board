import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// shadcn's Dialog (new-york), as copied by its CLI, cut to what the image viewer needs and made non-modal. The modal mode
// writes a <style> element to lock the page's scroll, which the server's Content-Security-Policy refuses (GOTCHAS), and
// without the modal mode Radix draws no overlay, so the content is itself the full-window blurred backdrop: a button that
// fills the backdrop, behind what is shown, closes it when clicked.

const Dialog = (props: ComponentProps<typeof DialogPrimitive.Root>) => <DialogPrimitive.Root modal={false} {...props} />;
const DialogTitle = DialogPrimitive.Title;

function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn("fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md outline-none", className)}
        {...props}
      >
        <DialogPrimitive.Close aria-hidden="true" tabIndex={-1} className="absolute inset-0 cursor-default" />
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-card text-card-foreground shadow-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X aria-hidden="true" className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogContent, DialogTitle };
