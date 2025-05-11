"use client";

import { z } from "zod";
import { toast } from "sonner";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { SparklesIcon, XIcon, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

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
import { ConditionIcon } from "@/components/ConditionIcon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { isUrl } from "@/lib/isUrl";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { deleteItem, getItem } from "@/lib/api/items";
import { fileToBase64 } from "@/lib/toBase64";

import { type Prisma, type Item, type Shelf, Condition } from "@prisma/client";
import { cn } from "@/lib/utils";

const itemSchema = z.object({
  shelfId: z.string().trim().min(1, "ShelfId is required"),

  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .refine((value) => value.trim().length > 0, "Name cannot be empty spaces"),

  barcode: z.string().trim().optional(),

  description: z.string().trim().optional(),

  condition: z.nativeEnum(Condition),

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [nameSuggestion, setNameSuggestion] = useState<string | null>(null);

  const debounce = useDebounce(1000);

  const defaultValues: FormValues = useMemo(
    () => ({
      shelfId,
      name: "",
      imageUrl: null,
      description: "",
      barcode: "",
      condition: "used",
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

  const handleBarcodeChange = useCallback(
    async (barcode: string) => {
      if (barcode.trim() === "") return;

      try {
        const response = await axios.get(`/api/barcode?q=${barcode}`);
        const data = response.data;

        if (data?.cleanName) {
          setNameSuggestion(data.cleanName);

          if (!form.watch("name")) {
            form.setValue("name", data.cleanName);
          }
        } else {
          setNameSuggestion(null);
        }
      } catch (error) {
        console.error("Erreur de recherche:", error);
        setNameSuggestion(null);
      }
    },
    [form],
  );

  const handleLogoChange = async (file: File | string | null) => {
    if (file != null) {
      if (file instanceof File) {
        if (!file.type.startsWith("image/")) {
          toast.error("Please upload a valid image file.");
          form.setValue("imageUrl", null);
          return;
        }

        try {
          const base64 = await fileToBase64(file);
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
    setIsSubmitting(true);
    try {
      let imageUrl: FormValues["imageUrl"] = values.imageUrl;
      if (imageUrl && imageUrl instanceof File) {
        imageUrl = await fileToBase64(imageUrl);
      }

      const updatedItem: Prisma.ItemUpdateInput | Prisma.ItemCreateInput = {
        ...values,
        id: item ? item?.id : undefined,
        imageUrl: imageUrl,
      };

      await onSubmit(updatedItem);
      onClose();
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Failed to save item");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!item?.id) return;
    setIsDeleting(true);
    try {
      await mutateDelete(item.id);
    } finally {
      setIsDeleting(false);
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
  }, [defaultValues, handleBarcodeChange, item, reset]);

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

                {/* Barcode */}
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
                            className="absolute right-1 rounded-sm"
                            onScan={(barcode) => {
                              form.setValue("barcode", barcode);
                              handleBarcodeChange(barcode);
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Name</FormLabel>
                      <FormControl>
                        <div className="relative flex items-center">
                          {nameSuggestion && field.value === nameSuggestion && (
                            <SparklesIcon className="absolute left-2 size-4 text-indigo-600 dark:text-indigo-300" />
                          )}

                          <Input
                            placeholder="Enter name"
                            className={cn("bg-background text-foreground", {
                              "pl-7":
                                nameSuggestion &&
                                field.value === nameSuggestion,
                              "text-indigo-600 dark:text-indigo-300":
                                nameSuggestion &&
                                field.value === nameSuggestion,
                            })}
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Description */}
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

                {/* Condition */}
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
                          {Object.values(Condition).map((condition) => (
                            <ToggleGroupItem
                              key={condition}
                              value={condition}
                              aria-label={condition}
                              className="flex flex-auto p-4 gap-1"
                            >
                              <ConditionIcon condition={condition} />
                              <span className="shrink-0 capitalize">
                                {condition}
                              </span>
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Cover */}
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Cover</FormLabel>
                      <FormControl>
                        <div className="flex flex-col gap-2 relative items-center justify-center">
                          {field.value && typeof field.value === "string" && (
                            <Image
                              width={200}
                              height={200}
                              src={field.value}
                              alt="Item cover"
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
              </div>

              <DialogFooter className="p-4 border-t shrink-0">
                {item?.id && (
                  <Button
                    type="button"
                    variant="destructive"
                    className="sm:mr-auto"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting}
                  >
                    Delete
                  </Button>
                )}

                <Button
                  type="button"
                  onClick={handleClose}
                  variant="secondary"
                  disabled={isSubmitting || isDeleting}
                >
                  Cancel
                </Button>

                <Button
                  variant="default"
                  type="submit"
                  disabled={isSubmitting || isDeleting}
                >
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
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
              disabled={isDeleting}
            >
              Cancel
            </Button>

            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
