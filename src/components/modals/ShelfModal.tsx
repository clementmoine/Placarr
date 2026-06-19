"use client";

import { z } from "zod";
import color from "color";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LibraryBig, Loader2 } from "lucide-react";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useLocale } from "@/lib/providers/LocaleProvider";
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
import { ImagePickerField } from "@/components/modals/ImagePickerField";
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
import { uploadImage } from "@/lib/api/upload";

import { type Prisma, type Shelf, Type } from "@prisma/client";

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
  const { t } = useLocale();

  const shelfSchema = z.object({
    name: z
      .string()
      .trim()
      .min(1, t("shelves.nameRequired"))
      .refine((value) => value.trim().length > 0, t("shelves.nameNotEmpty")),
    imageUrl: z
      .any()
      .refine(
        (url) =>
          url instanceof File ||
          (typeof url === "string" && url.startsWith("/uploads/")) ||
          isUrl(url) ||
          /^data:image\/[a-zA-Z+]+;base64,[^\s]+$/.test(url),
        t("shelves.imageRequired"),
      ),
    color: z
      .string()
      .trim()
      .min(1, t("shelves.colorRequired"))
      .refine((value) => {
        try {
          color(value);
          return true;
        } catch {
          return false;
        }
      }, t("shelves.invalidColorFormat")),
    type: z.nativeEnum(Type),
    cardFormat: z.string().default("default"),
  });

  type FormValues = z.infer<typeof shelfSchema>;

  const defaultValues: FormValues = useMemo(
    () => ({
      name: "",
      imageUrl: null,
      color: "white",
      type: "games",
      cardFormat: "default",
    }),
    [],
  );

  const typeIcons: Record<Type, React.ReactNode> = {
    games: <ShelfTypeIcon type="games" className="w-4 h-4" />,
    movies: <ShelfTypeIcon type="movies" className="w-4 h-4" />,
    musics: <ShelfTypeIcon type="musics" className="w-4 h-4" />,
    books: <ShelfTypeIcon type="books" className="w-4 h-4" />,
    boardgames: <ShelfTypeIcon type="boardgames" className="w-4 h-4" />,
  };

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
      toast.success(t("shelves.shelfDeleted", { name: shelf?.name }));
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
      handleClose();

      router.push(`/shelves`);
    },
    onError: () => {
      toast.error(t("shelves.deleteFailed"));
    },
  });
  const { reset } = form;

  const selectedType = form.watch("type");

  const defaultFormatLabel = useMemo(() => {
    let typeName = "";
    switch (selectedType) {
      case "musics":
      case "boardgames":
        typeName = t("shelf.type.musics") + " / " + t("shelf.type.boardgames");
        break;
      case "movies":
      case "books":
        typeName = t("shelf.type.movies") + " / " + t("shelf.type.books");
        break;
      case "games":
      default:
        typeName = t("shelf.type.games");
        break;
    }
    return t("shelves.cardFormats.default").replace("{type}", typeName);
  }, [selectedType, t]);

  useEffect(() => {
    if (shelf) {
      reset({
        type: shelf.type || defaultValues.type,
        name: shelf.name || defaultValues.name,
        imageUrl: shelf.imageUrl || defaultValues.imageUrl,
        color: shelf.color || defaultValues.color,
        cardFormat: shelf.cardFormat || defaultValues.cardFormat,
      });
    } else {
      reset(defaultValues);
    }
  }, [shelf, reset, defaultValues]);

  const handleLogoChange = async (file: File | string | null) => {
    if (file != null) {
      if (file instanceof File) {
        if (!file.type.startsWith("image/")) {
          toast.error(t("shelves.invalidImageFile"));
          form.setValue("imageUrl", null);
          return;
        }
        form.setValue("imageUrl", file);
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
        imageUrl = await uploadImage(imageUrl);
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
      <BaseModal
        isOpen={isOpen}
        onClose={handleClose}
        title={
          <div className="flex items-center gap-2">
            {shelf ? (
              <ShelfTypeIcon type={shelf.type} className="size-5" />
            ) : (
              <LibraryBig className="size-5" />
            )}
            <span>
              {shelf
                ? `${t("shelves.editShelf")} : ${shelf.name}`
                : t("shelves.addShelf")}
            </span>
          </div>
        }
        description={
          shelf
            ? t("shelves.editShelfDetails")
            : t("shelves.createNewShelfDetails")
        }
        size="xl-auto"
        customChildren={true}
        footer={null}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0 space-y-4">
              {/* Type */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
                      {t("common.type")}
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-zinc-50/50 dark:bg-zinc-950/20 text-xs h-10 border-border/80 rounded-xl focus:border-primary/80 focus:ring-primary/20 focus:ring-[3px] transition-all duration-200 w-full">
                          <SelectValue placeholder="Select a shelf type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(Type).map((type) => (
                          <SelectItem key={type} value={type}>
                            <div className="flex items-center gap-2">
                              {typeIcons[type]}
                              <span className="capitalize">
                                {t(`shelf.type.${type}`)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Card Format */}
              <FormField
                control={form.control}
                name="cardFormat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
                      {t("shelves.cardFormat")}
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "default"}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-zinc-50/50 dark:bg-zinc-950/20 text-xs h-10 border-border/80 rounded-xl focus:border-primary/80 focus:ring-primary/20 focus:ring-[3px] transition-all duration-200 w-full">
                          <SelectValue placeholder="Choisir le format" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="default">
                          {defaultFormatLabel}
                        </SelectItem>
                        <SelectItem value="square">
                          {t("shelves.cardFormats.square")}
                        </SelectItem>
                        <SelectItem value="ds">
                          {t("shelves.cardFormats.ds")}
                        </SelectItem>
                        <SelectItem value="bluray">
                          {t("shelves.cardFormats.bluray")}
                        </SelectItem>
                        <SelectItem value="dvd">
                          {t("shelves.cardFormats.dvd")}
                        </SelectItem>
                        <SelectItem value="book">
                          {t("shelves.cardFormats.book")}
                        </SelectItem>
                        <SelectItem value="switch">
                          {t("shelves.cardFormats.switch")}
                        </SelectItem>
                        <SelectItem value="psp">
                          {t("shelves.cardFormats.psp")}
                        </SelectItem>
                        <SelectItem value="vhs">
                          {t("shelves.cardFormats.vhs")}
                        </SelectItem>
                        <SelectItem value="landscape_retro">
                          {t("shelves.cardFormats.landscape_retro")}
                        </SelectItem>
                        <SelectItem value="landscape">
                          {t("shelves.cardFormats.landscape")}
                        </SelectItem>
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
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
                      {t("common.name")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("shelves.shelfName")}
                        className="bg-zinc-50/50 dark:bg-zinc-950/20 text-xs h-10 border-border/80 rounded-xl focus-visible:border-primary/80 focus-visible:ring-primary/20 focus-visible:ring-[3px] transition-all duration-200"
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
                  <ImagePickerField
                    value={field.value}
                    onChange={field.onChange}
                    onFileChange={handleLogoChange}
                    label={t("common.logo")}
                    placeholder="Pas de logo"
                    chooseImageText="Importer"
                    enterUrlText="Saisir une URL"
                    urlPlaceholderText="https://example.com/logo.jpg"
                    invalidUrlText="Image invalide"
                    previewBgColor={form.watch("color")}
                    contain={true}
                  />
                )}
              />

              {/* Color */}
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
                      {t("common.color")}
                    </FormLabel>
                    <FormControl>
                      <ColorPicker
                        placeholder={t("common.chooseColor")}
                        className="bg-zinc-50/50 dark:bg-zinc-950/20 border-border/80 rounded-xl focus:border-primary/80 transition-all duration-200"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="p-4 md:p-5 border-t border-border/60 dark:border-zinc-900/60 bg-zinc-50/30 dark:bg-zinc-950/30 shrink-0 flex flex-row items-center justify-end gap-2 w-full mt-6">
              {shelf?.id && (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto rounded-xl h-10 px-5 text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                >
                  {t("shelves.deleteShelf")}
                </Button>
              )}

              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                className="rounded-xl h-10 px-5 text-xs font-semibold border-border hover:bg-accent cursor-pointer active:scale-[0.98] transition-all"
                disabled={isSubmitting || isDeleting}
              >
                {t("shelves.cancel")}
              </Button>

              <Button
                variant="default"
                type="submit"
                className="rounded-xl h-10 px-5 text-xs font-semibold bg-primary hover:bg-primary/95 shadow-sm active:scale-[0.98] transition-all cursor-pointer"
                disabled={isSubmitting || isDeleting}
              >
                {isSubmitting && (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                )}
                {shelf ? t("shelves.saveChanges") : t("shelves.addShelf")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </BaseModal>

      {/* Delete dialog */}
      <BaseModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t("shelves.confirmDeletion")}
        description={t("shelves.deleteConfirmMessage")}
        size="sm"
        onCancel={() => setShowDeleteConfirm(false)}
        onDelete={handleDelete}
        deleteLabel={t("shelves.deleteShelf")}
        isDeleting={isDeleting}
        cancelLabel={t("shelves.cancel")}
      >
        <div className="hidden" />
      </BaseModal>
    </>
  );
}
