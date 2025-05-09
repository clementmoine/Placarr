"use client";

import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, LibraryBig, Search } from "lucide-react";
import { useCallback, useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import Header from "@/components/Header";
import { Card } from "@/components/Card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScannerButton } from "@/components/ScannerButton";
import { ShelfModal } from "@/components/modals/ShelfModal";

import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { getShelves, saveShelf } from "@/lib/api/shelves";

import type { Shelf, Prisma } from "@prisma/client";

import styles from "./shelves.module.css";

const shelfSchema = z.object({
  search: z.string(),
});

type FormValues = z.infer<typeof shelfSchema>;

const defaultValues: FormValues = {
  search: "",
};

export default function Shelves() {
  const form = useForm({
    resolver: zodResolver(shelfSchema),
    defaultValues,
  });

  const router = useRouter();

  const debounce = useDebounce();

  const [editingShelfId, setEditingShelfId] = useState<Shelf["id"]>();
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const searchParams = useSearchParams();

  const queryClient = useQueryClient();

  const { data: shelves, isFetching } = useQuery({
    queryKey: searchParams.get("q")
      ? ["shelves", searchParams.get("q")]
      : ["shelves"],
    queryFn: () => getShelves(searchParams.get("q")),
  });

  const { mutate } = useMutation<
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

  const sortedShelves = useMemo(
    () => shelves?.sort((a, b) => a.name.localeCompare(b.name)) || [],
    [shelves],
  );

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setEditingShelfId(undefined);
  }, []);

  const handleModalSubmit = useCallback(
    async (shelf: Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput) => {
      return new Promise<void>((resolve, reject) => {
        mutate(shelf, {
          onSuccess: () => resolve(),
          onError: () => reject(),
        });
      });
    },
    [mutate],
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

  const handleModalOpen = useCallback((id?: Shelf["id"]) => {
    setModalVisible(true);

    if (id !== null) {
      setEditingShelfId(id);
    }
  }, []);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    form.setValue("search", q);
  }, [searchParams, form]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <Header>
        <Button variant="default" onClick={() => handleModalOpen()}>
          <Plus />
          Add shelve
        </Button>
      </Header>

      {/* Modals */}
      <ShelfModal
        shelfId={editingShelfId}
        isOpen={modalVisible}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
      />

      {/* Content */}
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-foreground text-lg font-semibold">
          Your shelves ({shelves?.length || 0})
        </h2>

        <Form {...form}>
          <form
            onChange={(e) => {
              const search = (e.target as HTMLInputElement).value;

              debounce(() => handleSearch({ search }));
            }}
            onSubmit={form.handleSubmit(handleSearch)}
          >
            <FormField
              control={form.control}
              name="search"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="hidden text-foreground">
                    Search
                  </FormLabel>
                  <FormControl>
                    <div className="flex relative items-center">
                      <Search className="absolute size-4 left-3" />
                      <Input
                        type="search"
                        className="pr-11 pl-9"
                        placeholder="Search item or collection"
                        {...field}
                      />
                      <ScannerButton
                        className="absolute right-2"
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

        <div className={cn(styles.shelves, "mt-4")}>
          {sortedShelves.map((shelf, index) => (
            <Link key={`${shelf.id}-${index}`} href={`/shelves/${shelf.id}`}>
              <Card type="shelf" {...shelf} />
            </Link>
          ))}

          {isFetching &&
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton
                key={index}
                className="flex rounded-xl w-full"
                style={{
                  aspectRatio: "1.61792 / 1",
                }}
              />
            ))}
        </div>

        {/* Empty state */}
        {sortedShelves.length === 0 && !isFetching && (
          <div className="flex flex-col items-center justify-center h-full">
            <LibraryBig className="size-16 text-foreground mb-5" />

            <p className="text-foreground text-center">No shelf</p>
            <p className="text-foreground text-center">
              Add a new shelf to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
