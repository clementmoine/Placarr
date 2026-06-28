"use client";

import axios from "axios";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Layers,
  List,
  Loader2,
  ScanLine,
  XCircle,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { BaseModal } from "@/components/modals/BaseModal";
import { BulkSeriesForm } from "@/components/modals/BulkSeriesForm";
import { BarcodeScanCapture } from "@/components/BarcodeScanCapture";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DialogFooter } from "@/components/ui/dialog";
import { ConditionIcon } from "@/components/ConditionIcon";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { isBookShelfType } from "@/lib/barcode/shelfLabels";
import { saveItem, saveItemsBatch } from "@/lib/api/items";
import { parseNameList } from "@/lib/title/parseNameList";
import { syncItemQueries } from "@/lib/item/queryCache";
import { cn } from "@/lib/core/utils";
import { cleanManualBarcode } from "@/components/ManualBarcodeEntry";

import { Condition, type Shelf } from "@prisma/client";

export type BulkAddTab = "names" | "series" | "scan";

type ScannedRow = {
  id: string;
  barcode: string;
  name: string;
  status: "pending" | "done" | "error";
  error?: string;
};

const fieldInputClassName =
  "bg-zinc-50/50 dark:bg-zinc-950/20 border-border/80 rounded-xl focus-visible:border-amber-500/80 focus-visible:ring-amber-500/20 focus-visible:ring-[3px] transition-all duration-200 w-full text-xs sm:text-sm";

export function BulkAddModal({
  isOpen,
  onClose,
  shelfId,
  shelfName,
  shelfType,
  initialTab = "names",
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  shelfId: Shelf["id"];
  shelfName?: string;
  shelfType?: Shelf["type"];
  initialTab?: BulkAddTab;
  onSuccess?: (count: number) => void;
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const isBookShelf = isBookShelfType(shelfType);

  const defaultTab = useMemo(() => {
    if (initialTab === "series" && !isBookShelf) return "names";
    return initialTab;
  }, [initialTab, isBookShelf]);

  const [tab, setTab] = useState<BulkAddTab>(defaultTab);
  const [nameList, setNameList] = useState("");
  const [condition, setCondition] = useState<Condition>(Condition.used);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedRows, setScannedRows] = useState<ScannedRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setTab(defaultTab);
    setNameList("");
    setCondition(Condition.used);
    setScannedRows([]);
    setIsScanning(false);
  }, [isOpen, defaultTab]);

  const parsedNames = useMemo(() => parseNameList(nameList), [nameList]);

  const batchMutation = useMutation({
    mutationFn: saveItemsBatch,
    onSuccess: (result) => {
      toast.success(
        t("items.bulkAdd.namesSuccess").replace("{count}", String(result.count)),
      );
      onSuccess?.(result.count);
      onClose();
    },
    onError: () => {
      toast.error(t("items.bulkAdd.namesFailed"));
    },
  });

  const handleNamesSubmit = () => {
    if (parsedNames.length === 0) {
      toast.error(t("items.bulkAdd.namesRequired"));
      return;
    }
    batchMutation.mutate({
      shelfId,
      names: parsedNames,
      condition,
    });
  };

  const processBarcode = useCallback(
    async (rawBarcode: string) => {
      const barcode = cleanManualBarcode(rawBarcode);
      if (!barcode || isScanning) return;

      setIsScanning(true);
      const rowId = `${barcode}-${Date.now()}`;
      setScannedRows((rows) => [
        {
          id: rowId,
          barcode,
          name: barcode,
          status: "pending",
        },
        ...rows,
      ]);

      try {
        const params = new URLSearchParams({ q: barcode });
        if (shelfType) params.set("type", shelfType);
        const lookup = await axios.get(`/api/barcode?${params.toString()}`);
        const matches = lookup.data?.matches || [];
        const cleanName = lookup.data?.cleanName as string | undefined;
        const title =
          matches[0]?.name ||
          cleanName ||
          t("items.bulkAdd.unnamedItem").replace("{barcode}", barcode);

        if (matches.length > 1) {
          toast.info(t("items.bulkAdd.multipleMatchesUsed").replace("{name}", title));
        }

        const newItem = await saveItem({
          shelfId,
          name: title,
          barcode,
          condition,
          refreshMetadata: true,
        });

        await syncItemQueries(queryClient, newItem, [shelfId], {
          isCreate: true,
        });

        setScannedRows((rows) =>
          rows.map((row) =>
            row.id === rowId
              ? { ...row, name: title, status: "done" as const }
              : row,
          ),
        );
        onSuccess?.(1);
        toast.success(t("items.bulkAdd.scanAdded").replace("{name}", title));
      } catch (error) {
        const message =
          axios.isAxiosError(error) && error.response?.data?.error
            ? String(error.response.data.error)
            : t("items.bulkAdd.scanFailed");
        setScannedRows((rows) =>
          rows.map((row) =>
            row.id === rowId
              ? { ...row, status: "error" as const, error: message }
              : row,
          ),
        );
        toast.error(message);
      } finally {
        setIsScanning(false);
      }
    },
    [condition, isScanning, onSuccess, queryClient, shelfId, shelfType, t],
  );

  const scanCount = scannedRows.filter((row) => row.status === "done").length;
  const scanTabActive = isOpen && tab === "scan";

  return (
    <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        size="xl-auto"
        title={
          <div className="flex items-center gap-2">
            {shelfType && (
              <ShelfTypeIcon type={shelfType} className="size-5 shrink-0" />
            )}
            <span>{t("items.bulkAdd.title")}</span>
          </div>
        }
        description={
          shelfName
            ? t("items.bulkAdd.descriptionOnShelf").replace("{shelf}", shelfName)
            : t("items.bulkAdd.description")
        }
        customChildren
        footer={null}
      >
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as BulkAddTab)}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <div className="px-4 md:px-6 pt-4 shrink-0">
            <TabsList
              className={cn(
                "w-full grid h-auto p-1",
                isBookShelf ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              <TabsTrigger value="names" className="gap-1.5 py-2">
                <List className="size-4" />
                {t("items.bulkAdd.tabNames")}
              </TabsTrigger>
              {isBookShelf && (
                <TabsTrigger value="series" className="gap-1.5 py-2">
                  <Layers className="size-4" />
                  {t("items.bulkAdd.tabSeries")}
                </TabsTrigger>
              )}
              <TabsTrigger value="scan" className="gap-1.5 py-2">
                <ScanLine className="size-4" />
                {t("items.bulkAdd.tabScan")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="names"
            className="flex flex-col flex-1 min-h-0 overflow-hidden mt-0 px-4 md:px-6 pb-4 md:pb-6 data-[state=inactive]:hidden"
          >
            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden pt-4">
              <div className="flex flex-col flex-1 min-h-0 gap-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                  {t("items.bulkAdd.namesLabel")}
                </label>
                <Textarea
                  value={nameList}
                  onChange={(event) => setNameList(event.target.value)}
                  placeholder={t("items.bulkAdd.namesPlaceholder")}
                  className={cn(
                    fieldInputClassName,
                    "field-sizing-fixed flex-1 min-h-[180px] overflow-y-auto resize-none",
                  )}
                />
                <p className="text-xs text-muted-foreground shrink-0">
                  {t("items.bulkAdd.metadataHint")}
                </p>
              </div>

              <div className="space-y-2 shrink-0">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t("items.condition")}
                </label>
                <ToggleGroup
                  size="sm"
                  type="single"
                  variant="outline"
                  className="flex w-full gap-2 p-1 bg-zinc-200/50 dark:bg-zinc-900/60 rounded-xl border border-border/40"
                  value={condition}
                  onValueChange={(value) => {
                    if (value) setCondition(value as Condition);
                  }}
                >
                  {Object.values(Condition).map((entry) => (
                    <ToggleGroupItem
                      key={entry}
                      value={entry}
                      className="flex flex-auto py-2.5 px-3 gap-1.5 text-xs font-bold rounded-lg cursor-pointer"
                    >
                      <ConditionIcon condition={entry} />
                      {t(`items.conditions.${entry}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            <DialogFooter className="pt-4 mt-2 border-t border-border/60 shrink-0 flex flex-row items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleNamesSubmit}
                disabled={batchMutation.isPending || parsedNames.length === 0}
                className="rounded-xl"
              >
                {batchMutation.isPending && (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                )}
                {t("items.bulkAdd.namesSubmit").replace(
                  "{count}",
                  String(parsedNames.length),
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          {isBookShelf && (
            <TabsContent
              value="series"
              className="flex flex-col flex-1 min-h-0 overflow-hidden mt-0 px-4 md:px-6 pb-4 md:pb-6 data-[state=inactive]:hidden"
            >
              <div className="pt-4 flex-1 min-h-0 overflow-y-auto">
                <BulkSeriesForm
                  shelfId={shelfId}
                  isActive={isOpen && tab === "series"}
                  onSuccess={(count) => {
                    onSuccess?.(count);
                    onClose();
                  }}
                  onCancel={onClose}
                />
              </div>
            </TabsContent>
          )}

          <TabsContent
            value="scan"
            className="flex flex-col flex-1 min-h-0 overflow-hidden mt-0 px-4 md:px-6 pb-4 md:pb-6 data-[state=inactive]:hidden"
          >
            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden pt-4">
              <p className="text-xs text-muted-foreground shrink-0">
                {t("items.bulkAdd.scanHint")}
              </p>

              <div className="shrink-0">
                <BarcodeScanCapture
                  active={scanTabActive}
                  shelfType={shelfType}
                  disabled={isScanning}
                  onBarcode={(barcode) => void processBarcode(barcode)}
                />
              </div>

              <div className="space-y-2 shrink-0">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t("items.condition")}
                </label>
                <ToggleGroup
                  size="sm"
                  type="single"
                  variant="outline"
                  className="flex w-full gap-2 p-1 bg-zinc-200/50 dark:bg-zinc-900/60 rounded-xl border border-border/40"
                  value={condition}
                  onValueChange={(value) => {
                    if (value) setCondition(value as Condition);
                  }}
                >
                  {Object.values(Condition).map((entry) => (
                    <ToggleGroupItem
                      key={entry}
                      value={entry}
                      className="flex flex-auto py-2.5 px-3 gap-1.5 text-xs font-bold rounded-lg cursor-pointer"
                    >
                      <ConditionIcon condition={entry} />
                      {t(`items.conditions.${entry}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {scannedRows.length > 0 && (
                <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/60">
                  {scannedRows.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-start gap-2 px-3 py-2.5 text-sm"
                    >
                      {row.status === "pending" && (
                        <Loader2 className="size-4 shrink-0 animate-spin mt-0.5 text-muted-foreground" />
                      )}
                      {row.status === "done" && (
                        <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-500" />
                      )}
                      {row.status === "error" && (
                        <XCircle className="size-4 shrink-0 mt-0.5 text-rose-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{row.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {row.barcode}
                        </p>
                        {row.error && (
                          <p className="text-xs text-rose-500 mt-0.5">{row.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="pt-4 mt-2 border-t border-border/60 shrink-0 flex flex-row items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {scanCount > 0
                  ? t("items.bulkAdd.scanCount").replace("{count}", String(scanCount))
                  : t("items.bulkAdd.scanWaiting")}
              </span>
              <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
                {t("common.close")}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </BaseModal>
  );
}
