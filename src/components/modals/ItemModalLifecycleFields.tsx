"use client";

import type { Control, UseFormSetValue } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Award } from "lucide-react";

import {
  ABSENCE_REASONS,
  DEFINITIVE_ABSENCE_REASONS,
  ITEM_PRESENCES,
  TEMPORARY_ABSENCE_REASONS,
  type AbsenceReason,
  type ItemPresence,
  isAwaitingReceiptReason,
} from "@/core/collect/itemAbsence";
import {
  GRADE_STATUSES,
  KNOWN_GRADE_HOUSES,
  formatGradeBadge,
  type GradeStatus,
} from "@/core/collect/itemGrade";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type ItemModalLifecycleFormSlice = {
  /** Empty string = mixed / unset (bulk edit). */
  presence: ItemPresence | "";
  absenceReason: string;
  absenceSince: string;
  absenceRecipient: string;
  absenceSource: string;
  absenceCarrier: string;
  absenceTracking: string;
  absenceOrderRef: string;
  absenceOrderUrl: string;
  absenceNote: string;
  absencePrice: string;
  absenceExpectedAt: string;
  purchasePrice: string;
  purchasedAt: string;
  gradeStatus: GradeStatus;
  gradeHouse: string;
  gradeLabel: string;
  gradeCertNo: string;
  gradedAt: string;
};

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const HOUSE_LIST_ID = "placarr-grade-houses-modal";
const SOURCE_LIST_ID = "placarr-absence-sources";
const ABSENCE_SOURCES = [
  "Cardmarket",
  "Vinted",
  "Leboncoin",
  "Facebook",
  "Autre",
] as const;

function reasonsForPresence(presence: ItemPresence): readonly AbsenceReason[] {
  if (presence === "away") return TEMPORARY_ABSENCE_REASONS;
  if (presence === "past") return DEFINITIVE_ABSENCE_REASONS;
  if (presence === "wanted") return ABSENCE_REASONS;
  return [];
}

function defaultReason(presence: ItemPresence): AbsenceReason | "" {
  const list = reasonsForPresence(presence);
  return list[0] ?? "";
}

type Props = {
  // ItemModal form is wider than this slice — structural typing is enough.
  control: Control<ItemModalLifecycleFormSlice>;
  setValue: UseFormSetValue<ItemModalLifecycleFormSlice>;
  t: Translate;
  /** Hide purchase fields when not useful (optional). */
  showPurchase?: boolean;
  showGrade?: boolean;
  /**
   * Bulk edit: empty fields mean « mixed / leave alone »; presence may be "".
   */
  bulkMode?: boolean;
};

export function ItemModalLifecycleFields({
  control,
  setValue,
  t,
  showPurchase = true,
  showGrade = true,
  bulkMode = false,
}: Props) {
  const presence = useWatch({ control, name: "presence" }) as ItemPresence | "";
  const reason = useWatch({ control, name: "absenceReason" }) as string;
  const absenceSince = useWatch({ control, name: "absenceSince" }) as string;
  const gradeStatus = useWatch({
    control,
    name: "gradeStatus",
  }) as GradeStatus;
  const gradeHouse = useWatch({ control, name: "gradeHouse" }) as string;
  const gradeLabel = useWatch({ control, name: "gradeLabel" }) as string;

  const reasonOptions =
    presence === ""
      ? ABSENCE_REASONS
      : reasonsForPresence(presence as ItemPresence);
  const showAbsenceDetails =
    bulkMode || (presence !== "owned" && presence !== "");
  const showRecipient =
    reason === "loaned" || reason === "rental" || reason === "expected";
  const showOrder =
    isAwaitingReceiptReason(reason as AbsenceReason) || reason === "ordered";
  const showSale = reason === "sold" || reason === "exchanged";
  const showExpectedAt =
    reason === "loaned" ||
    reason === "rental" ||
    reason === "repair" ||
    showOrder;
  const gradeDisabled = gradeStatus === "raw";
  const badge = formatGradeBadge({
    gradeStatus,
    gradeHouse: gradeHouse || null,
    gradeLabel: gradeLabel || null,
  });

  const setOwned = () => {
    setValue("presence", "owned", { shouldDirty: true });
    setValue("absenceReason", "", { shouldDirty: true });
    setValue("absenceRecipient", "", { shouldDirty: true });
    setValue("absenceSource", "", { shouldDirty: true });
    setValue("absenceCarrier", "", { shouldDirty: true });
    setValue("absenceTracking", "", { shouldDirty: true });
    setValue("absenceOrderRef", "", { shouldDirty: true });
    setValue("absenceOrderUrl", "", { shouldDirty: true });
    setValue("absenceNote", "", { shouldDirty: true });
    setValue("absencePrice", "", { shouldDirty: true });
    setValue("absenceExpectedAt", "", { shouldDirty: true });
    setValue("absenceSince", "", { shouldDirty: true });
  };

  return (
    <div className="flex flex-col gap-4">
      {showPurchase ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-zinc-50/40 dark:bg-zinc-950/20 p-3 sm:p-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t("items.purchase.title")}
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug -mt-1">
            {t("items.purchase.hint")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              control={control}
              name="purchasePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.purchase.price")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="12,50"
                      className="bg-background border-border/80 rounded-xl h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="purchasedAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.purchase.date")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      className="bg-background border-border/80 rounded-xl h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ) : null}

      {showGrade ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-zinc-50/40 dark:bg-zinc-950/20 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t("items.grade.title")}
            </p>
            {badge ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <Award className="size-3" aria-hidden />
                {badge}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug -mt-1">
            {t("items.grade.hint")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              control={control}
              name="gradeStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.grade.status")}
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (GRADE_STATUSES.includes(value as GradeStatus)) {
                        field.onChange(value);
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background border-border/80 rounded-xl h-10">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GRADE_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`items.grade.statuses.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="gradeHouse"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.grade.house")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      list={HOUSE_LIST_ID}
                      disabled={gradeDisabled}
                      placeholder="PSA"
                      className="bg-background border-border/80 rounded-xl h-10"
                      {...field}
                    />
                  </FormControl>
                  <datalist id={HOUSE_LIST_ID}>
                    {KNOWN_GRADE_HOUSES.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="gradeLabel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.grade.label")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      disabled={gradeDisabled}
                      placeholder="10"
                      className="bg-background border-border/80 rounded-xl h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="gradeCertNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.grade.cert")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      disabled={gradeDisabled}
                      placeholder="12345678"
                      className="bg-background border-border/80 rounded-xl h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="gradedAt"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.grade.dated")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      disabled={gradeDisabled || gradeStatus === "submitted"}
                      className="bg-background border-border/80 rounded-xl h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-zinc-50/40 dark:bg-zinc-950/20 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t("items.absence.title")}
          </p>
          <div className="flex flex-wrap gap-1">
            {presence === "away" ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs font-semibold"
                  onClick={setOwned}
                >
                  {t("items.absence.return")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs font-semibold"
                  onClick={() => {
                    setValue("presence", "wanted", { shouldDirty: true });
                  }}
                >
                  {t("items.absence.cancel")}
                </Button>
              </>
            ) : null}
            {presence === "past" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs font-semibold"
                onClick={setOwned}
              >
                {t("items.absence.recover")}
              </Button>
            ) : null}
            {presence === "wanted" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs font-semibold"
                onClick={setOwned}
              >
                {t("items.absence.found")}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug -mt-1">
          {t("items.absence.hint")}
        </p>

        <FormField
          control={control}
          name="presence"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                {t("items.absence.presence")}
              </FormLabel>
              <Select
                value={field.value || undefined}
                onValueChange={(value) => {
                  if (!ITEM_PRESENCES.includes(value as ItemPresence)) return;
                  const next = value as ItemPresence;
                  field.onChange(next);
                  if (next === "owned") {
                    setOwned();
                    return;
                  }
                  const nextReason = defaultReason(next);
                  if (!bulkMode || !(reason || "").trim()) {
                    setValue("absenceReason", nextReason, {
                      shouldDirty: true,
                    });
                  }
                  if (!(absenceSince || "").trim()) {
                    setValue(
                      "absenceSince",
                      new Date().toISOString().slice(0, 10),
                      { shouldDirty: true },
                    );
                  }
                }}
              >
                <FormControl>
                  <SelectTrigger className="bg-background border-border/80 rounded-xl h-10">
                    <SelectValue
                      placeholder={
                        bulkMode ? t("items.bulkEdit.mixedValues") : undefined
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ITEM_PRESENCES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`items.absence.presences.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {showAbsenceDetails ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              control={control}
              name="absenceReason"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.absence.reason")}
                  </FormLabel>
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background border-border/80 rounded-xl h-10">
                        <SelectValue
                          placeholder={
                            bulkMode
                              ? t("items.bulkEdit.mixedValues")
                              : undefined
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {reasonOptions.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`items.timeline.reason.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="absenceSince"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.absence.since")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      className="bg-background border-border/80 rounded-xl h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showExpectedAt ? (
              <FormField
                control={control}
                name="absenceExpectedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                      {t("items.absence.expectedAt")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="bg-background border-border/80 rounded-xl h-10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {showRecipient ? (
              <FormField
                control={control}
                name="absenceRecipient"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                      {t("items.absence.recipient")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("items.absence.recipientPlaceholder")}
                        className="bg-background border-border/80 rounded-xl h-10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {showOrder || showSale ? (
              <FormField
                control={control}
                name="absenceSource"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                      {t("items.absence.source")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        list={SOURCE_LIST_ID}
                        placeholder={t("items.absence.sourcePlaceholder")}
                        className="bg-background border-border/80 rounded-xl h-10"
                        {...field}
                      />
                    </FormControl>
                    <datalist id={SOURCE_LIST_ID}>
                      {ABSENCE_SOURCES.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {showOrder ? (
              <>
                <FormField
                  control={control}
                  name="absenceCarrier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                        {t("items.absence.carrier")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="bg-background border-border/80 rounded-xl h-10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="absenceTracking"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                        {t("items.absence.tracking")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="bg-background border-border/80 rounded-xl h-10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="absenceOrderRef"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                        {t("items.absence.orderRef")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="bg-background border-border/80 rounded-xl h-10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="absenceOrderUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                        {t("items.absence.orderUrl")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          className="bg-background border-border/80 rounded-xl h-10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : null}
            {reason === "sold" ? (
              <FormField
                control={control}
                name="absencePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                      {t("items.absence.salePrice")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="25"
                        className="bg-background border-border/80 rounded-xl h-10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={control}
              name="absenceNote"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-[11px] font-semibold text-muted-foreground">
                    {t("items.absence.note")}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      className="bg-background border-border/80 rounded-xl min-h-[72px] text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
