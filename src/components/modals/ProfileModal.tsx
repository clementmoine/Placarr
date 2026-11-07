import { z } from "zod";
import { toast } from "sonner";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";

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
import { DialogFooter } from "@/components/ui/dialog";
import { BaseModal } from "@/components/modals/BaseModal";

import { useAccount } from "@/lib/client/hooks/useAccount";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";

interface ProfileModalProps {
  onClose: () => void;
}

/** App settings: change the unlock password only (mono-user instance). */
export function ProfileModal({ onClose }: ProfileModalProps) {
  const { t } = useLocale();
  const { update, isGuest } = useAccount();

  const schema = z
    .object({
      password: z
        .string()
        .min(
          MIN_PASSWORD_LENGTH,
          t("auth.passwordMinLength"),
        ),
      confirmPassword: z.string().min(1, t("auth.passwordRequired")),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: t("profile.passwordMismatch"),
      path: ["confirmPassword"],
    });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const changePassword = useMutation({
    mutationFn: async (values: FormValues) => {
      await update({ password: values.password });
    },
    onSuccess: () => {
      toast.success(t("profile.passwordUpdateSuccess"));
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

  if (isGuest) {
    return null;
  }

  return (
    <BaseModal
      isOpen={true}
      onClose={onClose}
      title={t("profile.changePasswordTitle")}
      size="md"
      customChildren={true}
      footer={null}
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => changePassword.mutate(values))}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0 space-y-5">
            <p className="text-sm text-muted-foreground leading-snug">
              {t("profile.changePasswordHint")}
            </p>
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
                      autoComplete="new-password"
                      autoFocus
                      placeholder={t("profile.passwordPlaceholder")}
                      className="bg-zinc-50/50 dark:bg-zinc-950/20 text-xs h-10 border-border/80 rounded-xl focus-visible:border-primary/80 focus-visible:ring-primary/20 focus-visible:ring-[3px] transition-all duration-200"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
                    {t("auth.confirmPassword")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      className="bg-zinc-50/50 dark:bg-zinc-950/20 text-xs h-10 border-border/80 rounded-xl focus-visible:border-primary/80 focus-visible:ring-primary/20 focus-visible:ring-[3px] transition-all duration-200"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <DialogFooter className="p-4 md:p-5 border-t border-border/60 dark:border-zinc-900/60 bg-zinc-50/30 dark:bg-zinc-950/30 shrink-0 flex flex-row items-center justify-end gap-2 w-full">
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
              disabled={changePassword.isPending}
            >
              {changePassword.isPending && (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              )}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </BaseModal>
  );
}
