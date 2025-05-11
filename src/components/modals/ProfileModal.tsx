import { z } from "zod";
import { toast } from "sonner";
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

import { useAccount } from "@/lib/hooks/useAccount";
import { isUrl } from "@/lib/isUrl";
import { cn } from "@/lib/utils";
import { fileToBase64 } from "@/lib/toBase64";

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .refine((value) => value.trim().length > 0, "Name cannot be empty spaces"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address"),
  password: z.string().trim().optional(),
  image: z
    .any()
    .refine(
      (url) =>
        url == "" ||
        url == null ||
        url instanceof File ||
        isUrl(url) ||
        /^data:image\/[a-zA-Z+]+;base64,[^\s]+$/.test(url),
      "Invalid image",
    )
    .optional(),
});

type FormValues = z.infer<typeof profileSchema>;

interface ProfileModalProps {
  onClose: () => void;
}

export function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, update, deleteAccount, isGuest } = useAccount();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
        imageUrl = await fileToBase64(imageUrl);
      }

      await update({
        name: values.name,
        image: imageUrl,
        email: values.email,
        password: values.password || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      onClose();
    },
    onError: (error) => {
      toast.error(
        `Failed to update profile: ${error instanceof Error ? error.message : "Unknown error"}`,
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
          toast.error("Please upload a valid image file.");
          form.setValue("image", null);
          return;
        }

        try {
          const base64 = await fileToBase64(file);
          form.setValue("image", base64);
        } catch (error) {
          console.error("Error converting file to base64:", error);
          form.setValue("image", null);
        }
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
      imageUrl = await fileToBase64(imageUrl);
    }
    updateProfile.mutate(values);
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
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh]">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle className="text-foreground">
            {isGuest ? "View Profile" : "Edit Profile"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col overflow-hidden"
          >
            <div className="overflow-x-hidden overflow-y-auto flex flex-col space-y-6 p-4 max-h-[60vh]">
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Avatar</FormLabel>
                    <FormControl>
                      <div className="flex flex-col gap-2 relative items-center justify-center">
                        {field.value && typeof field.value === "string" && (
                          <Image
                            width={200}
                            height={200}
                            src={field.value}
                            alt="User avatar"
                            className="absolute left-1 size-7 object-contain rounded-sm"
                          />
                        )}

                        <Input
                          type="file"
                          accept="image/*"
                          className={cn(
                            "bg-background text-foreground",
                            field.value && "pr-9 pl-9",
                          )}
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            field.onChange(file);
                            handleLogoChange(file);
                          }}
                          disabled={isGuest}
                        />

                        {field.value && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="absolute right-1 size-7 p-0 rounded-sm"
                            size="sm"
                            onClick={() => {
                              field.onChange(null);
                              handleLogoChange(null);
                            }}
                            disabled={isGuest}
                          >
                            <XIcon />
                          </Button>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isGuest} />
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isGuest} />
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
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        {...field}
                        disabled={isGuest}
                        placeholder="Leave blank to keep current password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="p-4 border-t shrink-0">
              <div className="flex justify-between w-full">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isGuest}
                >
                  Delete Account
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isGuest || updateProfile.isPending}
                  >
                    {updateProfile.isPending && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your account? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
