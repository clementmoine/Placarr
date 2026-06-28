"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogFooter } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConditionIcon } from "@/components/ConditionIcon";
import { saveItemsBatch } from "@/lib/api/items";
import { cn } from "@/lib/core/utils";
import {
  countSeriesVolumes,
  expandSeriesVolumeNames,
  parseSeriesVolume,
  previewSeriesPatternLabel,
  SERIES_VOLUME_PATTERNS,
  type SeriesVolumePatternKey,
} from "@/lib/title/seriesVolumeNames";

import { Condition, type Shelf } from "@prisma/client";

const fieldInputClassName =
  "bg-zinc-50/50 dark:bg-zinc-950/20 border-border/80 rounded-xl focus-visible:border-amber-500/80 focus-visible:ring-amber-500/20 focus-visible:ring-[3px] transition-all duration-200 w-full text-xs sm:text-sm h-10";

function volumeFieldSchema(message: string) {
  return z.preprocess(
    (value) => parseSeriesVolume(value) ?? Number.NaN,
    z.number().int().min(1, message),
  );
}

export function BulkSeriesForm({
  shelfId,
  isActive = true,
  onSuccess,
  onCancel,
  showFooter = true,
}: {
  shelfId: Shelf["id"];
  isActive?: boolean;
  onSuccess: (count: number) => void;
  onCancel: () => void;
  showFooter?: boolean;
}) {
  const { t } = useLocale();

  const schema = useMemo(
    () =>
      z
        .object({
          title: z
            .string()
            .trim()
            .min(1, t("items.bulkSeries.titleRequired")),
          fromVolume: volumeFieldSchema(t("items.bulkSeries.volumeMin")),
          toVolume: volumeFieldSchema(t("items.bulkSeries.volumeMin")),
          patternKey: z.enum(
            Object.keys(SERIES_VOLUME_PATTERNS) as [
              SeriesVolumePatternKey,
              ...SeriesVolumePatternKey[],
            ],
          ),
          condition: z.nativeEnum(Condition),
        })
        .refine((values) => values.toVolume >= values.fromVolume, {
          message: t("items.bulkSeries.volumeOrder"),
          path: ["toVolume"],
        }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      fromVolume: 1,
      toVolume: 1,
      patternKey: "tome_nn",
      condition: Condition.used,
    },
  });

  useEffect(() => {
    if (!isActive) return;
    form.reset({
      title: "",
      fromVolume: 1,
      toVolume: 1,
      patternKey: "tome_nn",
      condition: Condition.used,
    });
  }, [form, isActive]);

  const title = useWatch({ control: form.control, name: "title" });
  const fromVolume = useWatch({ control: form.control, name: "fromVolume" });
  const toVolume = useWatch({ control: form.control, name: "toVolume" });

  const volumeCount = countSeriesVolumes(fromVolume, toVolume);
  const patternRangeEnd =
    parseSeriesVolume(toVolume) ?? parseSeriesVolume(fromVolume) ?? 1;

  const patternLabels = useMemo(() => {
    const labels = {} as Record<SeriesVolumePatternKey, string>;
    for (const key of Object.keys(
      SERIES_VOLUME_PATTERNS,
    ) as SeriesVolumePatternKey[]) {
      labels[key] = previewSeriesPatternLabel(
        key,
        title ?? "",
        patternRangeEnd,
      );
    }
    return labels;
  }, [title, patternRangeEnd]);

  const { mutate, isPending } = useMutation({
    mutationFn: saveItemsBatch,
    onSuccess: (result) => {
      toast.success(
        t("items.bulkSeries.success").replace("{count}", String(result.count)),
      );
      onSuccess(result.count);
    },
    onError: () => {
      toast.error(t("items.bulkSeries.failed"));
    },
  });

  const handleSubmit = (values: FormValues) => {
    let names: string[];
    try {
      names = expandSeriesVolumeNames(
        values.title,
        values.fromVolume,
        values.toVolume,
        SERIES_VOLUME_PATTERNS[values.patternKey],
      );
    } catch {
      toast.error(t("items.bulkSeries.invalidRange"));
      return;
    }

    mutate({
      shelfId,
      names,
      condition: values.condition,
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex flex-col space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t("items.bulkSeries.seriesTitle")}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("items.bulkSeries.seriesTitlePlaceholder")}
                    className={fieldInputClassName}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="fromVolume"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {t("items.bulkSeries.fromVolume")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      className={fieldInputClassName}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value === "" ? "" : field.value}
                      onChange={(event) => {
                        const next = event.target.value;
                        field.onChange(
                          next === "" ? "" : Number.parseInt(next, 10),
                        );
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="toVolume"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {t("items.bulkSeries.toVolume")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      className={fieldInputClassName}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value === "" ? "" : field.value}
                      onChange={(event) => {
                        const next = event.target.value;
                        field.onChange(
                          next === "" ? "" : Number.parseInt(next, 10),
                        );
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="patternKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t("items.bulkSeries.namePattern")}
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className={fieldInputClassName}>
                      <SelectValue>
                        {patternLabels[field.value ?? "tome_nn"]}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(
                      Object.keys(
                        SERIES_VOLUME_PATTERNS,
                      ) as SeriesVolumePatternKey[]
                    ).map((key) => (
                      <SelectItem key={key} value={key}>
                        {patternLabels[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <p className="text-xs text-muted-foreground">
            {t("items.bulkAdd.metadataHint")}
          </p>

          <FormField
            control={form.control}
            name="condition"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t("items.condition")}
                </FormLabel>
                <FormControl>
                  <ToggleGroup
                    size="sm"
                    type="single"
                    variant="outline"
                    className="flex w-full gap-2 p-1 bg-zinc-200/50 dark:bg-zinc-900/60 rounded-xl border border-border/40"
                    value={field.value}
                    onValueChange={(value) => {
                      if (value) field.onChange(value as Condition);
                    }}
                  >
                    {Object.values(Condition).map((condition) => {
                      const isActiveCondition = field.value === condition;
                      let activeStyles = "";
                      if (isActiveCondition) {
                        if (condition === "new") {
                          activeStyles =
                            "bg-white text-emerald-600 dark:bg-zinc-800 dark:text-emerald-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-emerald-500/10";
                        } else if (condition === "used") {
                          activeStyles =
                            "bg-white text-amber-600 dark:bg-zinc-800 dark:text-amber-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-amber-500/10";
                        } else if (condition === "damaged") {
                          activeStyles =
                            "bg-white text-rose-600 dark:bg-zinc-800 dark:text-rose-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-rose-500/10";
                        }
                      }
                      return (
                        <ToggleGroupItem
                          key={condition}
                          value={condition}
                          aria-label={condition}
                          className={cn(
                            "flex flex-auto py-2.5 px-3 gap-1.5 text-xs font-bold rounded-lg transition-all duration-200 border border-transparent hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 text-muted-foreground cursor-pointer select-none",
                            isActiveCondition
                              ? activeStyles
                              : "bg-transparent hover:text-foreground",
                          )}
                        >
                          <ConditionIcon condition={condition} />
                          <span className="shrink-0 font-medium">
                            {t(`items.conditions.${condition}`)}
                          </span>
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {showFooter && (
          <DialogFooter className="pt-4 mt-4 border-t border-border/60 dark:border-zinc-900/60 shrink-0 flex flex-row items-center justify-end gap-2 w-full">
            <Button
              type="button"
              onClick={onCancel}
              variant="outline"
              className="rounded-xl h-10 px-5 text-xs font-semibold border-border hover:bg-accent cursor-pointer active:scale-[0.98] transition-all"
              disabled={isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="default"
              type="submit"
              className="rounded-xl h-10 px-5 text-xs font-semibold bg-primary hover:bg-primary/95 shadow-sm active:scale-[0.98] transition-all cursor-pointer"
              disabled={isPending || volumeCount === 0 || !title?.trim()}
            >
              {isPending && (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              )}
              {t("items.bulkSeries.submit").replace(
                "{count}",
                String(volumeCount || 0),
              )}
            </Button>
          </DialogFooter>
        )}
      </form>
    </Form>
  );
}
