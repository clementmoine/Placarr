"use client";

import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo, useState } from "react";
import { Plus, Wrench, Pizza, Search } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import Header from "@/components/Header";
import { ItemCard } from "@/components/ItemCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShelfBadge } from "@/components/ShelfBadge";
import { ItemModal } from "@/components/modals/ItemModal";
import { ScannerButton } from "@/components/ScannerButton";
import { ShelfModal } from "@/components/modals/ShelfModal";

import { cn } from "@/lib/utils";
import { saveItem } from "@/lib/api/items";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { getShelf, saveShelf } from "@/lib/api/shelves";

import type { Shelf, Prisma, Item } from "@prisma/client";
import type { ShelfWithItemCount } from "@/types/shelves";

import styles from "./shelf.module.css";

const itemSearchSchema = z.object({
  search: z.string(),
});

type FormValues = z.infer<typeof itemSearchSchema>;

export default function Shelf() {
  const params = useParams();
  const shelfId = params.shelfId as Shelf["id"];

  const [editingItemId, setEditingItemId] = useState<Item["id"]>();
  const [visibleModal, setVisibleModal] = useState<"shelf" | "item">();

  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") || "";

  const form = useForm<FormValues>({
    resolver: zodResolver(itemSearchSchema),
    defaultValues: { search: q },
  });

  const debounce = useDebounce();

  const queryClient = useQueryClient();

  const { data: shelf, isFetching } = useQuery({
    queryKey: ["shelf", shelfId, q],
    queryFn: () => getShelf(shelfId, q),
    initialData: () => {
      const shelf = queryClient
        .getQueryData<ShelfWithItemCount[]>(["shelves"])
        ?.find((s) => s.id === shelfId);

      // Fake items for proper skeleton
      return {
        ...(shelf as Shelf),
        items: Array.from({ length: shelf?._count.items || 1 }).map<Item>(
          () => ({
            id: "",
            name: "",
            imageUrl: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            shelfId: shelfId,
            description: null,
            barcode: null,
            condition: "new",
            metadataId: null,
          }),
        ),
      };
    },
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(["shelves"])?.dataUpdatedAt,
  });

  const { mutate: shelfMutate } = useMutation<
    Shelf,
    Error,
    Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput
  >({
    mutationFn: saveShelf,
    onSuccess: (shelf: Shelf) => {
      const shelfId = shelf.id;

      queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
    },
    onError: () => {
      toast.error("Error creating or updating shelf");
    },
  });

  const { mutate: itemMutate } = useMutation<
    Item,
    Error,
    Prisma.ItemCreateInput | Prisma.ItemUpdateInput
  >({
    mutationFn: saveItem,
    onSuccess: (item: Item) => {
      const itemId = item.id;
      const shelfId = item.shelfId;

      queryClient.invalidateQueries({
        queryKey: ["shelf", shelfId, "items", itemId],
      });
      queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
    },
    onError: () => {
      toast.error("Error creating or updating shelf");
    },
  });

  const sortedItems = useMemo(
    () => shelf?.items?.sort((a, b) => a.name.localeCompare(b.name)) || [],
    [shelf],
  );

  const handleModalClose = useCallback(() => {
    setVisibleModal(undefined);
    setEditingItemId(undefined);
  }, []);

  const handleShelfModalSubmit = useCallback(
    async (shelf: Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput) => {
      return new Promise<void>((resolve, reject) => {
        shelfMutate(shelf, {
          onSuccess: () => resolve(),
          onError: () => reject(),
        });
      });
    },
    [shelfMutate],
  );

  const handleItemModalSubmit = useCallback(
    async (item: Prisma.ItemCreateInput | Prisma.ItemUpdateInput) => {
      return new Promise<void>((resolve, reject) => {
        itemMutate(item, {
          onSuccess: () => resolve(),
          onError: () => reject(),
        });
      });
    },
    [itemMutate],
  );

  const handleSearch = async (values: FormValues) => {
    const value = values.search;

    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    router.replace(`?${params.toString()}`);
  };

  const handleModalOpen = useCallback(
    (modal: "shelf" | "item", id?: Item["id"]) => {
      setVisibleModal(modal);

      if (id !== null) {
        setEditingItemId(id);
      }
    },
    [],
  );

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <Header>
        <Button variant="secondary" onClick={() => handleModalOpen("shelf")}>
          <Wrench />
          Edit shelf
        </Button>

        <Button variant="default" onClick={() => handleModalOpen("item")}>
          <Plus />
          Add item
        </Button>
      </Header>

      {/* Modals */}
      <ShelfModal
        shelfId={shelf?.id}
        isOpen={visibleModal === "shelf"}
        onClose={handleModalClose}
        onSubmit={handleShelfModalSubmit}
      />
      <ItemModal
        shelfId={shelfId}
        itemId={editingItemId}
        isOpen={visibleModal === "item"}
        onClose={handleModalClose}
        onSubmit={handleItemModalSubmit}
      />

      {/* Content */}
      <div className="flex flex-col gap-4 p-4">
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem>
              <BreadcrumbLink asChild className="text-nowrap">
                <Link href="/shelves">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbPage className="flex gap-1 text-nowrap">
              <ShelfBadge shelf={shelf} isFetching={isFetching} />
              {shelf?.name || "Shelf"}
            </BreadcrumbPage>
          </BreadcrumbList>
        </Breadcrumb>

        <h2 className="text-foreground text-lg font-semibold">
          Items ({shelf?.items?.length || 0})
        </h2>

        <Form {...form}>
          <form
            onChange={(e) => {
              const search = (e.target as HTMLInputElement).value;

              debounce(() => handleSearch({ search }));
            }}
            onSubmit={form.handleSubmit(() => {})}
          >
            <FormField
              control={form.control}
              name="search"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="hidden">Search</FormLabel>
                  <FormControl>
                    <div className="flex relative items-center">
                      <Search className="absolute size-4 left-3" />
                      <Input
                        type="search"
                        className="pr-10 pl-9"
                        placeholder="Search item"
                        {...field}
                      />
                      <ScannerButton
                        className="absolute right-1 rounded-sm"
                        onScan={(barcode) => {
                          handleSearch({ search: barcode });
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <div className={cn(styles["shelf_items"], "mt-4")}>
          {sortedItems.map((item, index) =>
            isFetching ? (
              <Skeleton
                key={index}
                className="flex rounded-xl w-full"
                style={{
                  aspectRatio: "1 / 1.4",
                }}
              />
            ) : (
              <Link
                key={`${item.id}-${index}`}
                href={`/shelves/${shelf?.id}/${item.id}/`}
              >
                <ItemCard {...item} />
              </Link>
            ),
          )}
        </div>

        {/* Empty state */}
        {sortedItems.length === 0 && !isFetching && (
          <div className="flex flex-col items-center justify-center h-full">
            <Pizza className="size-16 text-foreground mb-5" />

            <p className="text-foreground text-center">No items</p>
            <p className="text-foreground text-center">
              Add a new item to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
