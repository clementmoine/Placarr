"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { toast } from "sonner";

import {
  GRADE_STATUSES,
  KNOWN_GRADE_HOUSES,
  formatGradeBadge,
  type GradeStatus,
} from "@/core/collect/itemGrade";
import { saveItem } from "@/lib/api/items";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HOUSE_LIST_ID = "placarr-grade-houses";

type GradeFields = {
  gradeStatus?: GradeStatus | string | null;
  gradeHouse?: string | null;
  gradeLabel?: string | null;
  gradeCertNo?: string | null;
  gradedAt?: Date | string | null;
};

type Props = {
  itemId: string;
  shelfId?: string | null;
  grade: GradeFields;
};

export function ItemGradeEditor({ itemId, shelfId, grade }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<GradeStatus>(
    (grade.gradeStatus as GradeStatus) || "raw",
  );
  const [house, setHouse] = useState(grade.gradeHouse ?? "");
  const [label, setLabel] = useState(grade.gradeLabel ?? "");
  const [cert, setCert] = useState(grade.gradeCertNo ?? "");

  useEffect(() => {
    setStatus((grade.gradeStatus as GradeStatus) || "raw");
    setHouse(grade.gradeHouse ?? "");
    setLabel(grade.gradeLabel ?? "");
    setCert(grade.gradeCertNo ?? "");
  }, [
    grade.gradeStatus,
    grade.gradeHouse,
    grade.gradeLabel,
    grade.gradeCertNo,
  ]);

  const mutation = useMutation({
    mutationFn: () =>
      saveItem({
        id: itemId,
        currentShelfId: shelfId,
        gradeStatus: status,
        gradeHouse: house || null,
        gradeLabel: label || null,
        gradeCertNo: cert || null,
      }),
    onSuccess: async () => {
      toast.success(t("items.grade.saved"));
      await queryClient.invalidateQueries({ queryKey: ["shelf", shelfId] });
      await queryClient.invalidateQueries({ queryKey: ["item-events", itemId] });
    },
    onError: () => toast.error(t("items.grade.failed")),
  });

  const badge = formatGradeBadge({
    gradeStatus: status,
    gradeHouse: house || null,
    gradeLabel: label || null,
  });

  return (
    <section className="mt-6 space-y-3" aria-label={t("items.grade.title")}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold tracking-tight text-foreground">
          {t("items.grade.title")}
        </h2>
        {badge ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <Award className="size-3" aria-hidden />
            {badge}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t("items.grade.hint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("items.grade.status")}
          <Select
            value={status}
            onValueChange={(value) => {
              if (GRADE_STATUSES.includes(value as GradeStatus)) {
                setStatus(value as GradeStatus);
              }
            }}
          >
            <SelectTrigger className="h-9 font-normal normal-case tracking-normal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRADE_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`items.grade.statuses.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("items.grade.house")}
          <Input
            list={HOUSE_LIST_ID}
            value={house}
            onChange={(event) => setHouse(event.target.value)}
            disabled={status === "raw"}
            placeholder="PSA"
            className="h-9 font-normal normal-case tracking-normal"
          />
          <datalist id={HOUSE_LIST_ID}>
            {KNOWN_GRADE_HOUSES.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("items.grade.label")}
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={status === "raw"}
            placeholder="10"
            className="h-9 font-normal normal-case tracking-normal"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("items.grade.cert")}
          <Input
            value={cert}
            onChange={(event) => setCert(event.target.value)}
            disabled={status === "raw"}
            placeholder="12345678"
            className="h-9 font-normal normal-case tracking-normal"
          />
        </label>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t("items.grade.save")}
      </Button>
    </section>
  );
}
