"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Wrench, Search, Link2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShelfBadge } from "@/components/ShelfBadge";
import { ItemModal } from "@/components/modals/ItemModal";
import { ConditionIcon } from "@/components/ConditionIcon";
import { MetadataModal } from "@/components/modals/MetadataModal";

import { getShelf } from "@/lib/api/shelves";
import { getItem, saveItem } from "@/lib/api/items";
import { getMetadataPreview } from "@/lib/api/metadata";

import type { ShelfWithItems } from "@/types/shelves";
import type { ItemWithMetadata } from "@/types/items";
import type { Shelf, Prisma, Item } from "@prisma/client";
import type { MetadataWithIncludes } from "@/types/metadata";
import { ItemCarousel } from "@/components/ItemCarousel";
import { useAccount } from "@/lib/hooks/useAccount";

export default function Shelves() {
  const params = useParams();
  const { isGuest, hasPermission, isAuthenticated } = useAccount();
  const shelfId = params.shelfId as Shelf["id"];
  const itemId = params.itemId as Item["id"];

  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [metadataModalVisible, setMetadataModalVisible] =
    useState<boolean>(false);
  const [previewMetadata, setPreviewMetadata] =
    useState<MetadataWithIncludes | null>(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);

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
        ?.items?.find((i) => i.id === itemId) as ItemWithMetadata,
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(["shelves"])?.dataUpdatedAt,
  });

  const { mutate } = useMutation<
    Item,
    Error,
    | Prisma.ItemCreateInput
    | (Prisma.ItemUpdateInput & {
        refreshMetadata?: boolean;
        lookupQuery?: string;
      })
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

  const handleMetadataPreview = useCallback(
    async (name: string) => {
      if (!shelf?.type) return;

      setIsFetchingMetadata(true);
      try {
        const metadata = await getMetadataPreview(
          name,
          shelf.type,
          item?.barcode,
        );
        setPreviewMetadata(metadata);
      } catch (error) {
        console.error("Error fetching metadata:", error);
        toast.error("Failed to fetch metadata");
      } finally {
        setIsFetchingMetadata(false);
      }
    },
    [shelf?.type, item?.barcode],
  );

  const handleMetadataUpdate = useCallback(
    async (name: string) => {
      if (!item?.id || !shelf?.type) return;

      try {
        await mutate({
          id: item.id,
          lookupQuery: name,
          refreshMetadata: true,
        });
        toast.success("Metadata updated successfully");
      } catch (error) {
        console.error("Error updating metadata:", error);
        toast.error("Failed to update metadata");
      }
    },
    [item?.id, shelf?.type, mutate],
  );

  const year = useMemo(() => {
    if (!item?.metadata?.releaseDate) return undefined;

    const date = new Date(item?.metadata?.releaseDate);
    if (isNaN(date.getTime())) {
      return undefined;
    }
    return date.getFullYear();
  }, [item?.metadata?.releaseDate]);

  const canEdit = useMemo(() => {
    if (!item) return false;
    return hasPermission(item.userId);
  }, [item, hasPermission]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <Header>
        <div className="flex gap-2">
          {/* Fix metadata */}
          {isAuthenticated && !isGuest && canEdit && (
            <Button
              variant="secondary"
              onClick={() => setMetadataModalVisible(true)}
            >
              {item?.metadataId ? (
                <Link2 className="size-4" />
              ) : (
                <Search className="size-4" />
              )}
              {item?.metadataId ? "Fix meta" : "Find meta"}
            </Button>
          )}

          {/* Edit item */}
          {isAuthenticated && !isGuest && canEdit && (
            <Button variant="default" onClick={() => setModalVisible(true)}>
              <Wrench className="size-4" />
              Edit item
            </Button>
          )}
        </div>
      </Header>

      {/* Modals */}
      {isAuthenticated && !isGuest && canEdit && (
        <>
          <ItemModal
            shelfId={shelfId}
            itemId={itemId}
            isOpen={modalVisible}
            onClose={handleModalClose}
            onSubmit={handleModalSubmit}
          />

          {shelf?.type && item?.name && (
            <MetadataModal
              isOpen={metadataModalVisible}
              onClose={() => {
                setMetadataModalVisible(false);
                setPreviewMetadata(null);
              }}
              onSubmit={handleMetadataUpdate}
              onPreview={handleMetadataPreview}
              currentName={item.name}
              type={shelf.type}
              metadata={previewMetadata}
              isFetching={isFetchingMetadata}
            />
          )}
        </>
      )}

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
            <BreadcrumbPage className="truncate">
              {`${item?.name}${year ? ` (${year})` : ""}` || "Item"}
            </BreadcrumbPage>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Carrousel of images (with the cover and the images from the metadata) */}
        {isFetching ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <ItemCarousel item={item} />
        )}

        <h2 className="relative text-foreground text-lg font-semibold">
          {isFetching ? (
            <span className="inline-block">
              <Skeleton className="absolute inset-0" />
            </span>
          ) : (
            `${item?.name}${year ? ` (${year})` : ""}`
          )}
        </h2>

        {/* Condition in tag */}
        <Badge variant="outline" className="capitalize">
          <ConditionIcon condition={item?.condition} />
          {item?.condition?.toLocaleLowerCase() || "Not Provided"}
        </Badge>

        <p className="relative text-foreground text-sm empty:hidden">
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
              <TableHead className="w-1/2 md:w-1/3">Data</TableHead>
              <TableHead className="w-1/2 md:w-2/3 whitespace-pre-wrap break-words">
                Value
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Original title */}
            {item?.metadata?.title && (
              <TableRow>
                <TableCell className="w-1/2 md:w-1/3">Original title</TableCell>
                <TableCell className="w-1/2 md:w-2/3 whitespace-pre-wrap break-words">
                  {item?.metadata?.title || "Not Provided"}
                </TableCell>
              </TableRow>
            )}

            {/* Authors from the metadata */}
            {item?.metadata?.authors?.length !== 0 && (
              <TableRow>
                <TableCell className="w-1/2 md:w-1/3">Authors</TableCell>
                <TableCell className="w-1/2 md:w-2/3 whitespace-pre-wrap break-words">
                  {item?.metadata?.authors.map((a) => a.name).join(", ")}
                </TableCell>
              </TableRow>
            )}

            {/* Publishers from the metadata */}
            {item?.metadata?.publishers?.length !== 0 && (
              <TableRow>
                <TableCell className="w-1/2 md:w-1/3">Publisher</TableCell>
                <TableCell className="w-1/2 md:w-2/3 whitespace-pre-wrap break-words">
                  {item?.metadata?.publishers.map((p) => p.name).join(", ")}
                </TableCell>
              </TableRow>
            )}

            {/* Description from the metadata */}
            {item?.metadata?.description && (
              <TableRow>
                <TableCell className="w-1/2 md:w-1/3">Description</TableCell>
                <TableCell className="w-1/2 md:w-2/3 whitespace-pre-wrap break-words">
                  {item?.metadata?.description}
                </TableCell>
              </TableRow>
            )}

            {/* Aired date */}
            {item?.metadata?.releaseDate && (
              <TableRow>
                <TableCell className="w-1/2 md:w-1/3">Aired date</TableCell>
                <TableCell className="w-1/2 md:w-2/3 whitespace-pre-wrap break-words">
                  {new Date(item.metadata.releaseDate).toLocaleDateString(
                    "en-US",
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    },
                  )}
                </TableCell>
              </TableRow>
            )}

            {/* Bar code */}
            <TableRow>
              <TableCell className="w-1/2 md:w-1/3">Barcode</TableCell>
              <TableCell className="w-1/2 md:w-2/3 whitespace-pre-wrap break-words">
                {item?.barcode || "Not Provided"}
              </TableCell>
            </TableRow>

            {/* Date added */}
            <TableRow>
              <TableCell className="w-1/2 md:w-1/3">Added date</TableCell>
              <TableCell className="w-1/2 md:w-2/3 whitespace-pre-wrap break-words">
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
              <TableCell className="w-1/2 md:w-1/3">Last update</TableCell>
              <TableCell className="w-1/2 md:w-2/3 whitespace-pre-wrap break-words">
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
