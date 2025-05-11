"use client";

import { z } from "zod";
import color from "color";
import { toast } from "sonner";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Gamepad2,
  Film,
  Music,
  BookOpen,
  XIcon,
  Puzzle,
  Loader2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { deleteShelf, getShelf } from "@/lib/api/shelves";
import { isUrl } from "@/lib/isUrl";
import { cn } from "@/lib/utils";
import { fileToBase64 } from "@/lib/toBase64";

import { type Prisma, type Shelf, Type } from "@prisma/client";

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
        url instanceof File ||
        isUrl(url) ||
        /^data:image\/[a-zA-Z+]+;base64,[^\s]+$/.test(url),
      "Image is required",
    ),
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
  type: z.nativeEnum(Type),
});

type FormValues = z.infer<typeof shelfSchema>;

const defaultValues: FormValues = {
  name: "",
  imageUrl: null,
  color: "white",
  type: "games",
};

const typeIcons: Record<Type, React.ReactNode> = {
  games: <Gamepad2 className="w-4 h-4" />,
  movies: <Film className="w-4 h-4" />,
  musics: <Music className="w-4 h-4" />,
  books: <BookOpen className="w-4 h-4" />,
  boardgames: <Puzzle className="w-4 h-4" />,
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
        type: shelf.type || defaultValues.type,
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

      const updatedShelf: Prisma.ShelfUpdateInput | Prisma.ShelfCreateInput = {
        ...values,
        id: shelf ? shelf?.id : undefined,
        imageUrl: imageUrl,
      };

      await onSubmit(updatedShelf);
      onClose();
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Failed to save shelf");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!shelf?.id) return;
    setIsDeleting(true);
    try {
      await mutateDelete(shelf.id);
    } finally {
      setIsDeleting(false);
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
                {/* Type */}
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-background text-foreground w-full">
                            <SelectValue placeholder="Select a shelf type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(Type).map((type) => (
                            <SelectItem key={type} value={type}>
                              <div className="flex items-center gap-2">
                                {typeIcons[type]}
                                <span className="capitalize">{type}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

                {/* Logo */}
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Logo</FormLabel>
                      <FormControl>
                        <div className="flex flex-col gap-2 relative items-center justify-center">
                          {field.value && typeof field.value === "string" && (
                            <Image
                              width={200}
                              height={200}
                              src={field.value}
                              alt="Item cover"
                              className="absolute left-1 size-7 object-contain rounded-sm"
                              style={{
                                backgroundColor: form.watch("color"),
                              }}
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

                          {field.value !== null && (
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

                {/* Color */}
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
              Are you sure you want to delete this shelf? This action cannot be
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
