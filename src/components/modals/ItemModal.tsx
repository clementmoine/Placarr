"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Recycle, Skull, SparklesIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ScannerButton } from "@/components/ScannerButton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { isUrl } from "@/lib/isUrl";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { deleteItem, getItem } from "@/lib/api/items";

import type { Prisma, Item, Shelf } from "@prisma/client";

const itemSchema = z.object({
  shelfId: z.string().trim().min(1, "ShelfId is required"),

  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .refine((value) => value.trim().length > 0, "Name cannot be empty spaces"),

  barcode: z.string().trim().optional(),

  description: z.string().trim().optional(),

  condition: z.enum(["NEW", "USED", "DAMAGED"]),

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
});

type FormValues = z.infer<typeof itemSchema>;

const convertFileToBase64 = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export function ItemModal({
  isOpen,
  onClose,
  onSubmit,
  itemId,
  shelfId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    item: Prisma.ItemUpdateInput | Prisma.ItemCreateInput,
  ) => Promise<void>;
  itemId?: Item["id"];
  shelfId: Shelf["id"];
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [nameSuggestion, setNameSuggestion] = useState<string | null>(null);

  const debounce = useDebounce(1000);

  const defaultValues: FormValues = useMemo(
    () => ({
      shelfId,
      name: "",
      imageUrl: null,
      description: "",
      barcode: "",
      condition: "USED",
    }),
    [shelfId],
  );

  const form = useForm({
    resolver: zodResolver(itemSchema),
    defaultValues,
  });

  const router = useRouter();

  const queryClient = useQueryClient();

  const { data: item } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => getItem(itemId),
    initialData: () =>
      queryClient
        .getQueryData<Item[]>(["shelves"])
        ?.find((s) => s.id === itemId),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(["shelves"])?.dataUpdatedAt,
  });

  const { mutate: mutateDelete } = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      toast.success(`Item ${item?.name} deleted`);
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["shelf", item?.shelfId] });
      handleClose();

      router.push(`/shelves/${item?.shelfId}`);
    },
    onError: () => {
      toast.error("Failed to delete item");
    },
  });

  const { reset } = form;

  const handleBarcodeChange = async (barcode: string) => {
    if (barcode.trim() === "") return;

    try {
      const response = await fetch(`/api/barcode?q=${barcode}`);
      const data = await response.json();

      if (data?.cleanName) {
        setNameSuggestion(data.cleanName);
      } else {
        setNameSuggestion(null);
      }
    } catch (error) {
      console.error("Erreur de recherche:", error);
      setNameSuggestion(null);
    }
  };

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

    const updatedItem: Prisma.ItemUpdateInput | Prisma.ItemCreateInput = {
      ...values,
      id: item ? item?.id : undefined,
      imageUrl: imageUrl,
    };

    await onSubmit(updatedItem);
    handleClose();
  };

  const handleDelete = async () => {
    if (item?.id) {
      mutateDelete(item.id);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (item) {
      reset({
        shelfId: item.shelfId || defaultValues.shelfId,
        name: item.name || defaultValues.name,
        description: item.description || defaultValues.description,
        condition: item.condition || defaultValues.condition,
        imageUrl: item.imageUrl || defaultValues.imageUrl,
        barcode: item.barcode || defaultValues.barcode,
      });

      if (item.barcode) {
        handleBarcodeChange(item.barcode);
      }
    } else {
      reset(defaultValues);
    }
  }, [defaultValues, item, reset]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh]">
          <DialogHeader className="p-4 border-b shrink-0">
            <DialogTitle className="text-foreground">
              {item ? "Edit item" : "Add a new item"}
            </DialogTitle>
            <DialogDescription className="text-foreground">
              {item
                ? "Edit the details of your item."
                : "Fill in the details to create a new item."}
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
                  name="shelfId"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormLabel className="text-foreground">Shelf</FormLabel>
                      <FormControl>
                        <Input
                          type="string"
                          placeholder="Shelf to add the item to"
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
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Barcode</FormLabel>
                      <FormControl>
                        <div className="flex relative items-center">
                          <Input
                            type="text"
                            className="pr-11"
                            placeholder="Enter barcode"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              debounce(() =>
                                handleBarcodeChange(e.target.value),
                              );
                            }}
                          />
                          <ScannerButton
                            className="absolute right-2"
                            onScan={(barcode) => {
                              form.setValue("barcode", barcode);
                              handleBarcodeChange(barcode);
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />

                      {nameSuggestion && (
                        <p className="flex items-center overflow-hidden gap-2">
                          <Button
                            type="button"
                            variant="link"
                            className="!p-0 overflow-hidden shrink text-indigo-600 dark:text-indigo-300"
                            onClick={() =>
                              form.setValue("name", nameSuggestion)
                            }
                          >
                            <SparklesIcon />
                            <span className="text-ellipsis overflow-hidden text-nowrap">
                              {nameSuggestion}
                            </span>
                          </Button>
                        </p>
                      )}
                    </FormItem>
                  )}
                />

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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">
                        Description
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter description"
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
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">
                        Condition
                      </FormLabel>
                      <FormControl>
                        <ToggleGroup
                          size="sm"
                          type="single"
                          variant="outline"
                          className="flex w-full"
                          onValueChange={field.onChange}
                          {...field}
                        >
                          <ToggleGroupItem
                            value="NEW"
                            aria-label="New"
                            className="flex flex-auto p-4"
                          >
                            <SparklesIcon className="shrink-0" />
                            <span className="shrink-0">New</span>
                          </ToggleGroupItem>

                          <ToggleGroupItem
                            value="USED"
                            aria-label="Used"
                            className="flex flex-auto p-4"
                          >
                            <Recycle className="shrink-0" />
                            <span className="shrink-0">Used</span>
                          </ToggleGroupItem>

                          <ToggleGroupItem
                            value="DAMAGED"
                            aria-label="Damaged"
                            className="flex flex-auto p-4"
                          >
                            <Skull className="shrink-0" />
                            <span className="shrink-0">Damaged</span>
                          </ToggleGroupItem>
                        </ToggleGroup>
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
                      <FormLabel className="text-foreground">Cover</FormLabel>
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
              </div>

              <DialogFooter className="p-4 border-t shrink-0">
                {item?.id && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="sm:mr-auto"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete
                  </Button>
                )}

                <Button type="button" onClick={handleClose} variant="secondary">
                  Cancel
                </Button>

                <Button variant="default" type="submit">
                  {item ? "Save Changes" : "Add Item"}
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
