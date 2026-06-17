import { z } from "zod";
import { toast } from "sonner";
import { useLocale } from "@/lib/providers/LocaleProvider";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { XIcon, Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { BaseModal } from "@/components/modals/BaseModal";
import { ImagePickerField } from "@/components/modals/ImagePickerField";

import { useAccount } from "@/lib/hooks/useAccount";
import { isUrl } from "@/lib/isUrl";
import { cn } from "@/lib/utils";
import { uploadImage } from "@/lib/api/upload";

interface ProfileModalProps {
  onClose: () => void;
}

export function ProfileModal({ onClose }: ProfileModalProps) {
  const { t } = useLocale();
  const { user, update, deleteAccount, isGuest } = useAccount();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const profileSchema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t("profile.nameRequired"))
      .refine((value) => value.trim().length > 0, t("profile.nameNotEmpty")),
    email: z
      .string()
      .trim()
      .min(1, t("profile.emailRequired"))
      .email(t("profile.invalidEmail")),
    password: z.string().trim().optional(),
    image: z
      .any()
      .refine(
        (url) =>
          url == "" ||
          url == null ||
          url instanceof File ||
          (typeof url === "string" && url.startsWith("/uploads/")) ||
          isUrl(url) ||
          /^data:image\/[a-zA-Z+]+;base64,[^\s]+$/.test(url),
        t("profile.invalidImage"),
      )
      .optional(),
  });

  type FormValues = z.infer<typeof profileSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      password: "",
      image: user?.image || "",
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (values: FormValues) => {
      let imageUrl: FormValues["image"] = values.image;
      if (imageUrl && imageUrl instanceof File) {
        imageUrl = await uploadImage(imageUrl);
      }

      await update({
        name: values.name,
        image: imageUrl,
        email: values.email,
        password: values.password || undefined,
      });
    },
    onSuccess: () => {
      toast.success(t("profile.updateSuccess"));
      onClose();
    },
    onError: (error) => {
      toast.error(
        t("profile.updateFailed", {
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    },
  });

  if (!user) {
    return null;
  }

  const handleLogoChange = async (file: File | string | null) => {
    if (file != null) {
      if (file instanceof File) {
        if (!file.type.startsWith("image/")) {
          toast.error(t("profile.invalidImage"));
          form.setValue("image", null);
          return;
        }
        form.setValue("image", file);
      } else {
        form.setValue("image", file);
      }
    } else {
      form.setValue("image", null);
    }
  };

  const handleSubmit = async (values: FormValues) => {
    if (isGuest) return;
    let imageUrl: FormValues["image"] = values.image;
    if (imageUrl && imageUrl instanceof File) {
      imageUrl = await uploadImage(imageUrl);
    }
    updateProfile.mutate({
      ...values,
      image: imageUrl,
    });
  };

  const handleDeleteAccount = async () => {
    if (isGuest) return;
    setIsDeleting(true);
    try {
      await deleteAccount();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <BaseModal
        isOpen={true}
        onClose={onClose}
        title={isGuest ? t("profile.viewProfile") : t("profile.editProfile")}
        size="md"
        customChildren={true}
        footer={null}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0 space-y-5">
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <ImagePickerField
                    value={field.value}
                    onChange={field.onChange}
                    onFileChange={handleLogoChange}
                    label={t("profile.avatar")}
                    placeholder="Pas d'avatar"
                    chooseImageText="Importer"
                    enterUrlText="Saisir une URL"
                    urlPlaceholderText="https://example.com/avatar.jpg"
                    invalidUrlText="Image invalide"
                  />
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
                      {t("common.name")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isGuest}
                        className="bg-zinc-50/50 dark:bg-zinc-950/20 text-xs h-10 border-border/80 rounded-xl focus-visible:border-primary/80 focus-visible:ring-primary/20 focus-visible:ring-[3px] transition-all duration-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
                      {t("auth.email")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isGuest}
                        className="bg-zinc-50/50 dark:bg-zinc-950/20 text-xs h-10 border-border/80 rounded-xl focus-visible:border-primary/80 focus-visible:ring-primary/20 focus-visible:ring-[3px] transition-all duration-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
                      {t("profile.newPassword")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        {...field}
                        disabled={isGuest}
                        placeholder={t("profile.passwordPlaceholder")}
                        className="bg-zinc-50/50 dark:bg-zinc-950/20 text-xs h-10 border-border/80 rounded-xl focus-visible:border-primary/80 focus-visible:ring-primary/20 focus-visible:ring-[3px] transition-all duration-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="p-4 md:p-5 border-t border-border/60 dark:border-zinc-900/60 bg-zinc-50/30 dark:bg-zinc-950/30 shrink-0 flex flex-row items-center justify-end gap-2 w-full mt-6">
              <Button
                type="button"
                variant="destructive"
                className="mr-auto rounded-xl h-10 px-5 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isGuest}
              >
                {t("profile.deleteAccount")}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="rounded-xl h-10 px-5 text-xs font-semibold border-border hover:bg-accent cursor-pointer active:scale-[0.98] transition-all"
                onClick={onClose}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="rounded-xl h-10 px-5 text-xs font-semibold bg-primary hover:bg-primary/95 shadow-sm active:scale-[0.98] transition-all cursor-pointer"
                disabled={isGuest || updateProfile.isPending}
              >
                {updateProfile.isPending && (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                )}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </BaseModal>

      {/* Delete confirmation dialog */}
      <BaseModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t("profile.deleteAccount")}
        description={t("profile.deleteConfirmMessage")}
        size="sm"
        onCancel={() => setShowDeleteConfirm(false)}
        onDelete={handleDeleteAccount}
        deleteLabel={t("profile.deleteAccount")}
        isDeleting={isDeleting}
        cancelLabel={t("common.cancel")}
      >
        <div className="hidden" />
      </BaseModal>
    </>
  );
}
