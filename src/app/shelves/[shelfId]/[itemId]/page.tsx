"use client";

import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";
import { Wrench } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShelfBadge } from "@/components/ShelfBadge";
import { ItemModal } from "@/components/modals/ItemModal";

import { getShelf } from "@/lib/api/shelves";
import { getItem, saveItem } from "@/lib/api/items";

import type { ShelfWithItems } from "@/types/shelves";
import type { Shelf, Prisma, Item } from "@prisma/client";

export default function Shelves() {
  const params = useParams();
  const shelfId = params.shelfId as Shelf["id"];
  const itemId = params.itemId as Item["id"];

  const [modalVisible, setModalVisible] = useState<boolean>(false);

  const queryClient = useQueryClient();

  const { data: shelf } = useQuery({
    queryKey: ["shelf", shelfId],
    queryFn: () => getShelf(shelfId),
  });

  const { data: item, isFetching } = useQuery({
    queryKey: ["shelf", shelfId, "items", itemId],
    queryFn: () => getItem(itemId),
    initialData: () =>
      queryClient
        .getQueryData<ShelfWithItems>(["shelf", shelfId])
        ?.items?.find((i) => i.id === itemId),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(["shelves"])?.dataUpdatedAt,
  });

  const { mutate } = useMutation<
    Item,
    Error,
    Prisma.ItemCreateInput | Prisma.ItemUpdateInput
  >({
    mutationFn: saveItem,
    onSuccess: (item: Item) => {
      const shelfId = item.shelfId;

      queryClient.invalidateQueries({
        queryKey: ["shelf", shelfId, "items", itemId],
      });
      queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
    },
    onError: () => {
      toast.error("Error creating or updating shelf");
    },
  });

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleModalSubmit = useCallback(
    async (shelf: Prisma.ShelfUpdateInput) => {
      return new Promise<void>((resolve, reject) => {
        mutate(shelf, {
          onSuccess: () => resolve(),
          onError: () => reject(),
        });
      });
    },
    [mutate],
  );

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <Header>
        <Button variant="default" onClick={() => setModalVisible(true)}>
          <Wrench />
          Edit item
        </Button>
      </Header>

      {/* Modals */}
      <ItemModal
        shelfId={shelfId}
        itemId={itemId}
        isOpen={modalVisible}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
      />

      {/* Content */}
      <div className="flex flex-col gap-4 p-4">
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem>
              <BreadcrumbLink asChild className="flex-nowrap">
                <Link href="/shelves">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbLink className="flex gap-1 text-nowrap" asChild>
              <Link href={`/shelves/${shelfId}`}>
                <ShelfBadge shelf={shelf} isFetching={isFetching} />
                {shelf?.name || "Shelf"}
              </Link>
            </BreadcrumbLink>
            <BreadcrumbSeparator />
            <BreadcrumbPage className="text-ellipsis overflow-hidden text-nowrap">
              {item?.name || "Item"}
            </BreadcrumbPage>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Carrousel of images */}
        {isFetching ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          item?.imageUrl && (
            <Image
              src={item?.imageUrl}
              alt={item?.name || "Item image"}
              width={250}
              height={250}
              className="h-80 w-full object-contain"
            />
          )
        )}

        <h2 className="relative text-foreground text-lg font-semibold">
          {isFetching ? (
            <span className="inline-block">
              <Skeleton className="absolute inset-0" />
            </span>
          ) : (
            item?.name
          )}
        </h2>

        <p className="relative text-foreground text-sm">
          {isFetching ? (
            <span className="inline-block">
              <Skeleton className="absolute inset-0" />
            </span>
          ) : (
            item?.description
          )}
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Condition */}
            <TableRow>
              <TableCell>Condition</TableCell>
              <TableCell className="capitalize">
                {item?.condition.toLocaleLowerCase() || "Not Provided"}
              </TableCell>
            </TableRow>

            {/* Bar code */}
            <TableRow>
              <TableCell>GTIN/EAN</TableCell>
              <TableCell>{item?.barcode || "Not Provided"}</TableCell>
            </TableRow>

            {/* Date added */}
            <TableRow>
              <TableCell>Added date</TableCell>
              <TableCell>
                {item?.createdAt
                  ? new Date(item?.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    })
                  : "Not Available"}
              </TableCell>
            </TableRow>

            {/* Last edit */}
            <TableRow>
              <TableCell>Last update</TableCell>
              <TableCell>
                {item?.updatedAt
                  ? new Date(item.updatedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    })
                  : "Not Available"}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
