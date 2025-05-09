"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import color from "color";
import { z } from "zod";

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
import { ColorPicker } from "@/components/ColorPicker";

import { isUrl } from "@/lib/isUrl";

import type { Prisma, Shelf } from "@prisma/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteShelf, getShelf } from "@/lib/api/shelves";
import { useRouter } from "next/navigation";

const shelfSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .refine((value) => value.trim().length > 0, "Name cannot be empty spaces"),
  imageUrl: z
    .any()
    .refine(
      (url) =>
        url == null ||
        url instanceof File ||
        isUrl(url) ||
        /^data:image\/[a-zA-Z+]+;base64,[^\s]+$/.test(url),
      "Invalid image",
    )
    .optional(),
  color: z
    .string()
    .trim()
    .min(1, "Color is required")
    .refine((value) => {
      try {
        color(value);
        return true;
      } catch {
        return false;
      }
    }, "Invalid color format"),
});

type FormValues = z.infer<typeof shelfSchema>;

const convertFileToBase64 = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const defaultValues: FormValues = {
  name: "",
  imageUrl: null,
  color: "",
};

export function ShelfModal({
  isOpen,
  onClose,
  onSubmit,
  shelfId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    shelf: Prisma.ShelfUpdateInput | Prisma.ShelfCreateInput,
  ) => Promise<void>;
  shelfId?: Shelf["id"];
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const form = useForm({
    resolver: zodResolver(shelfSchema),
    defaultValues,
  });

  const router = useRouter();

  const queryClient = useQueryClient();

  const { data: shelf } = useQuery({
    queryKey: ["shelf", shelfId],
    queryFn: () => getShelf(shelfId),
    initialData: () =>
      queryClient
        .getQueryData<Shelf[]>(["shelves"])
        ?.find((s) => s.id === shelfId),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(["shelves"])?.dataUpdatedAt,
  });

  const { mutate: mutateDelete } = useMutation({
    mutationFn: deleteShelf,
    onSuccess: () => {
      toast.success(`Shelf ${shelf?.name} deleted`);
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
      handleClose();

      router.push(`/shelves`);
    },
    onError: () => {
      toast.error("Failed to delete item");
    },
  });
  const { reset } = form;

  useEffect(() => {
    if (shelf) {
      reset({
        name: shelf.name || defaultValues.name,
        imageUrl: shelf.imageUrl || defaultValues.imageUrl,
        color: shelf.color || defaultValues.color,
      });
    } else {
      reset(defaultValues);
    }
  }, [shelf, reset]);

  const handleLogoChange = async (file: File | string | null) => {
    if (file != null) {
      if (file instanceof File) {
        if (!file.type.startsWith("image/")) {
          toast.error("Please upload a valid image file.");
          form.setValue("imageUrl", null);
          return;
        }

        try {
          const base64 = await convertFileToBase64(file);
          form.setValue("imageUrl", base64);
        } catch (error) {
          console.error("Error converting file to base64:", error);
          form.setValue("imageUrl", null);
        }
      } else {
        form.setValue("imageUrl", file);
      }
    } else {
      form.setValue("imageUrl", null);
    }
  };

  const handleSubmit = async (values: FormValues) => {
    let imageUrl: FormValues["imageUrl"] = values.imageUrl;
    if (imageUrl && imageUrl instanceof File) {
      imageUrl = await convertFileToBase64(imageUrl);
    }

    const updatedShelf: Prisma.ShelfUpdateInput | Prisma.ShelfCreateInput = {
      id: shelf ? shelf?.id : undefined,
      name: values.name,
      imageUrl: imageUrl,
      color: values.color,
    };

    await onSubmit(updatedShelf);
    handleClose();
  };

  const handleDelete = async () => {
    if (shelf?.id) {
      mutateDelete(shelf.id);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh]">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="text-foreground">
              {shelf ? "Edit shelf" : "Add a new shelf"}
            </DialogTitle>
            <DialogDescription className="text-foreground">
              {shelf
                ? "Edit the details of your shelf."
                : "Fill in the details to create a new shelf."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="flex flex-col overflow-hidden"
            >
              <div className="overflow-x-hidden overflow-y-auto flex flex-col space-y-4 p-4 max-h-[60vh]">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter name"
                          className="bg-background text-foreground"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Logo</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept="image/*"
                          className="bg-background text-foreground"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            field.onChange(file);
                            handleLogoChange(file);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Color</FormLabel>
                      <FormControl>
                        <ColorPicker
                          placeholder="Choose a color"
                          className="bg-background text-foreground"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter className="p-4 border-t shrink-0">
                {shelf?.id && (
                  <Button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="sm:mr-auto bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-800 text-white"
                  >
                    Delete
                  </Button>
                )}

                <Button type="button" onClick={handleClose} variant="secondary">
                  Cancel
                </Button>

                <Button variant="default" type="submit">
                  {shelf ? "Save Changes" : "Add Shelf"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Delete dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>

            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
