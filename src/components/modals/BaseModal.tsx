"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "xl-auto" | "full";
  className?: string;
  children: React.ReactNode;
  customChildren?: boolean;

  // Footer props
  footer?: React.ReactNode;

  // Standard actions helper if footer is not customized
  onSubmit?: (e: React.FormEvent) => void | Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;

  cancelLabel?: string;
  onCancel?: () => void;

  onDelete?: () => void | Promise<void>;
  deleteLabel?: string;
  isDeleting?: boolean;
}

export function BaseModal({
  isOpen,
  onClose,
  title,
  description,
  size = "md",
  className,
  children,
  customChildren = false,
  footer,
  onSubmit,
  submitLabel,
  isSubmitting = false,
  submitDisabled = false,
  cancelLabel,
  onCancel,
  onDelete,
  deleteLabel,
  isDeleting = false,
}: BaseModalProps) {
  // Sizing mapping
  const sizeClasses = {
    sm: "sm:max-w-md w-[95vw] max-h-[90dvh]", // QuickScanModal / Confirmation dialogs
    md: "sm:max-w-lg w-[95vw] max-h-[90dvh]", // ProfileModal
    lg: "sm:max-w-4xl w-[95vw] max-h-[90dvh]", // AssociationModal
    xl: "sm:max-w-3xl w-[95vw] h-[85vh] md:h-[750px] max-h-[90dvh]", // ItemModal
    "xl-auto": "sm:max-w-3xl w-[95vw] max-h-[90dvh]", // ShelfModal
    full: "w-screen h-screen",
  };

  const handleClose = () => {
    onClose();
  };

  const hasVisibleChildren = React.Children.toArray(children).some((child) => {
    if (!child) return false;
    if (React.isValidElement(child)) {
      const props = child.props as any;
      if (
        props.className?.includes("hidden") ||
        (child.type === "div" && props.className === "hidden")
      ) {
        return false;
      }
    }
    return true;
  });

  const isConfirmDialog = size === "sm" && !submitLabel;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "flex flex-col p-0 overflow-hidden bg-zinc-50/98 dark:bg-zinc-950/98 backdrop-blur-md text-foreground gap-0 border border-border/80 dark:border-zinc-850/80 rounded-2xl shadow-2xl",
          sizeClasses[size],
          className,
        )}
      >
        {(title || description) && (
          <DialogHeader
            className={cn(
              "p-5 md:p-6 pb-4 shrink-0 flex flex-row items-center justify-between",
              !isConfirmDialog &&
                "border-b border-border/60 dark:border-zinc-900/60",
            )}
          >
            <div className="flex flex-col gap-0.5">
              {title && (
                <DialogTitle className="text-lg font-black tracking-tight text-foreground dark:text-white leading-none">
                  {title}
                </DialogTitle>
              )}
              {description && (
                <DialogDescription className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  {description}
                </DialogDescription>
              )}
            </div>
          </DialogHeader>
        )}

        {/* Scrollable content area */}
        {hasVisibleChildren &&
          (customChildren ? (
            children
          ) : (
            <div className="flex-1 overflow-y-auto p-5 md:p-6 min-h-0 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {children}
            </div>
          ))}

        {/* Footer */}
        {footer !== undefined
          ? footer && (
              <DialogFooter className="p-4 md:p-5 border-t border-border/60 dark:border-zinc-900/60 bg-zinc-50/30 dark:bg-zinc-950/30 shrink-0 flex flex-row items-center justify-end gap-2 w-full">
                {footer}
              </DialogFooter>
            )
          : (submitLabel || cancelLabel || deleteLabel) && (
              <DialogFooter
                className={cn(
                  "p-4 md:p-5 shrink-0 flex flex-row items-center justify-end gap-2 w-full",
                  isConfirmDialog
                    ? "pb-6 px-6 pt-0"
                    : "border-t border-border/60 dark:border-zinc-900/60 bg-zinc-50/30 dark:bg-zinc-950/30",
                )}
              >
                {/* 1. Delete button for main forms (when submitLabel exists) */}
                {onDelete && deleteLabel && submitLabel && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="mr-auto rounded-xl h-10 px-5 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                    onClick={onDelete}
                    disabled={isDeleting || isSubmitting}
                  >
                    {isDeleting && (
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                    )}
                    {deleteLabel}
                  </Button>
                )}

                {/* 2. Cancel button */}
                <Button
                  type="button"
                  onClick={onCancel || handleClose}
                  variant="outline"
                  className="rounded-xl h-10 px-5 text-xs font-semibold border-border hover:bg-accent cursor-pointer active:scale-[0.98] transition-all"
                  disabled={isSubmitting || isDeleting}
                >
                  {cancelLabel || "Annuler"}
                </Button>

                {/* 3. Delete button for dedicated confirmation dialogs (when no submitLabel exists) */}
                {onDelete && deleteLabel && !submitLabel && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="rounded-xl h-10 px-5 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                    onClick={onDelete}
                    disabled={isDeleting || isSubmitting}
                  >
                    {isDeleting && (
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                    )}
                    {deleteLabel}
                  </Button>
                )}

                {/* 4. Submit button */}
                {submitLabel && (
                  <Button
                    variant="default"
                    type={onSubmit ? "button" : "submit"}
                    onClick={onSubmit}
                    className="rounded-xl h-10 px-5 text-xs font-semibold bg-primary hover:bg-primary/95 shadow-sm active:scale-[0.98] transition-all cursor-pointer"
                    disabled={submitDisabled || isSubmitting || isDeleting}
                  >
                    {isSubmitting && (
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                    )}
                    {submitLabel}
                  </Button>
                )}
              </DialogFooter>
            )}
      </DialogContent>
    </Dialog>
  );
}
