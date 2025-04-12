"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, LibraryBig } from "lucide-react";

import Header from "@/components/Header";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShelfModal } from "@/components/modals/ShelfModal";

import { getShelves, saveShelf } from "@/lib/api/shelves";

import type { Shelf, Prisma } from "@prisma/client";

import styles from "./shelves.module.css";

export default function Shelves() {
  const [editingShelfId, setEditingShelfId] = useState<Shelf["id"]>();
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  const queryClient = useQueryClient();

  const { data: shelves, isFetching } = useQuery({
    queryKey: ["shelves"],
    queryFn: getShelves,
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

  const handleModalOpen = useCallback((id?: Shelf["id"]) => {
    setModalVisible(true);

    if (id !== null) {
      setEditingShelfId(id);
    }
  }, []);

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
        <h2 className="text-foreground text-lg font-semibold mb-4">
          Your shelves ({shelves?.length || 0})
        </h2>

        <div className={styles.shelves}>
          {sortedShelves.map((shelf, index) => (
            <Card type="shelf" key={`${shelf.id}-${index}`} {...shelf} />
          ))}

          {isFetching &&
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton
                key={index}
                className="flex aspect-[1.61792/1] rounded-xl w-full"
              />
            ))}
        </div>

        {/* Empty state */}
        {sortedShelves.length === 0 && !isFetching && (
          <div className="flex flex-col items-center justify-center h-full">
            <LibraryBig className="size-16 text-foreground mb-5" />
            <p className="text-foreground text-center">No shelf available</p>
            <p className="text-foreground text-center">
              Add a new shelf to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
