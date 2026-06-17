"use client";

import React, { useState, useMemo, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import {
  Inbox,
  User,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  RotateCcw,
  Loader2,
  Calendar,
  Sparkles,
} from "lucide-react";
import Image from "next/image";

import Header from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/lib/providers/LocaleProvider";

function LoansPageComponent() {
  const { t, locale } = useLocale();
  const queryClient = useQueryClient();

  const { data: loanData, isFetching } = useQuery({
    queryKey: ["loans"],
    queryFn: async () => {
      const { data } = await axios.get("/api/loans");
      return data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: string }) => {
      const { data } = await axios.patch("/api/loans", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      toast.success(t("common.success") || "Action réussie");
    },
    onError: () => {
      toast.error(t("common.error"));
    },
  });

  const handleUpdateStatus = (id: string, status: string) => {
    updateStatusMutation.mutate({ id, status });
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <Badge className="bg-yellow-500/10 border-none select-none text-yellow-600 dark:text-yellow-400 font-bold text-[10px] leading-none py-1.5 px-3 rounded-full">
            {t("loans.pending") || "En attente"}
          </Badge>
        );
      case "APPROVED":
        return (
          <Badge className="bg-emerald-500/10 border-none select-none text-emerald-600 dark:text-emerald-400 font-bold text-[10px] leading-none py-1.5 px-3 rounded-full">
            {t("loans.approved") || "Prêté"}
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge className="bg-rose-500/10 border-none select-none text-rose-600 dark:text-rose-400 font-bold text-[10px] leading-none py-1.5 px-3 rounded-full">
            {t("loans.rejected") || "Refusé"}
          </Badge>
        );
      case "RETURNED":
      default:
        return (
          <Badge className="bg-zinc-500/10 border-none select-none text-muted-foreground font-bold text-[10px] leading-none py-1.5 px-3 rounded-full">
            {t("loans.returned") || "Retourné"}
          </Badge>
        );
    }
  };

  const sentRequests = useMemo(() => loanData?.sent || [], [loanData]);
  const receivedRequests = useMemo(() => loanData?.received || [], [loanData]);

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground z-0">
      {/* Header */}
      <Header />

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 flex flex-col gap-6 max-w-7xl w-full mx-auto animate-fade-in duration-300">
        {/* Title */}
        <div className="flex flex-col gap-2 mt-4">
          <div className="flex items-center gap-2">
            <Inbox className="size-6 text-primary" />
            <h2 className="text-xl md:text-2xl font-black tracking-tight">
              {t("loans.title") || "Gestion des Prêts"}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Suivez et gérez les objets que vous avez prêtés à d'autres
            collectionneurs ou ceux que vous avez empruntés.
          </p>
        </div>

        {/* Loading state */}
        {isFetching ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <Tabs defaultValue="borrowed" className="w-full flex flex-col gap-4">
            <TabsList className="grid w-full max-w-sm grid-cols-2 rounded-2xl h-10 p-1 bg-zinc-100 dark:bg-zinc-900 border select-none">
              <TabsTrigger
                value="borrowed"
                className="rounded-xl text-xs font-semibold cursor-pointer"
              >
                {t("loans.borrowed") || "Empruntés"} ({sentRequests.length})
              </TabsTrigger>
              <TabsTrigger
                value="lent"
                className="rounded-xl text-xs font-semibold cursor-pointer"
              >
                {t("loans.lent") || "Prêtés"} ({receivedRequests.length})
              </TabsTrigger>
            </TabsList>

            {/* Borrowed items tab content */}
            <TabsContent
              value="borrowed"
              className="flex flex-col gap-4 mt-0 animate-fade-in"
            >
              {sentRequests.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {sentRequests.map((req: any) => (
                    <div
                      key={req.id}
                      className="group relative flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 bg-zinc-50/20 dark:bg-zinc-950/40 border border-border/60 dark:border-zinc-800/80 rounded-2xl shadow-sm hover:border-zinc-350 dark:hover:border-zinc-750 transition-all duration-200"
                    >
                      {/* Item image */}
                      <div className="relative size-16 sm:size-20 rounded-xl overflow-hidden border shrink-0 bg-zinc-950/20 shadow-inner select-none">
                        {req.item?.imageUrl ? (
                          <Image
                            src={req.item.imageUrl}
                            alt={req.item.name}
                            width={128}
                            height={128}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 text-muted-foreground font-black text-xs">
                            ??
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <h4 className="text-sm font-extrabold text-foreground leading-tight truncate">
                          {req.item?.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground leading-none">
                          <span className="flex items-center gap-1">
                            <User className="size-3.5" />
                            {t("loans.owner")}:{" "}
                            {req.owner?.name || req.owner?.email}
                          </span>
                          <span className="flex items-center gap-1 select-none">
                            <Calendar className="size-3.5" />
                            {new Date(req.createdAt).toLocaleDateString(
                              locale,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </span>
                        </div>
                        {req.notes && (
                          <div className="flex items-start gap-1 p-2 bg-zinc-100/50 dark:bg-zinc-900/50 border border-border/40 rounded-xl max-w-xl mt-1 select-none">
                            <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                              {req.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Status and Actions */}
                      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 w-full sm:w-auto shrink-0 select-none">
                        {renderStatusBadge(req.status)}

                        {req.status === "PENDING" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={updateStatusMutation.isPending}
                            onClick={() =>
                              handleUpdateStatus(req.id, "REJECTED")
                            }
                            className="rounded-xl h-8 px-4 text-[10px] font-bold active:scale-[0.98] transition-all cursor-pointer"
                          >
                            {t("loans.actions.cancel") || "Annuler"}
                          </Button>
                        )}
                        {req.status === "APPROVED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={updateStatusMutation.isPending}
                            onClick={() =>
                              handleUpdateStatus(req.id, "RETURNED")
                            }
                            className="rounded-xl h-8 px-4 text-[10px] font-bold border-border hover:bg-accent active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1"
                          >
                            <RotateCcw className="size-3" />
                            {t("loans.actions.return") || "Rendre"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-zinc-50/5 dark:bg-zinc-950/20 border border-dashed border-border/80 dark:border-zinc-800/80 rounded-3xl select-none animate-fade-in">
                  <Inbox className="size-10 text-zinc-400 dark:text-zinc-600 mb-3 animate-pulse" />
                  <h3 className="text-sm font-bold text-foreground mb-1">
                    {t("loans.noLoansTitle") || "Aucun emprunt actif"}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                    {t("loans.noLoansDesc") ||
                      "Vous n'avez aucun objet emprunté. Explorez les collections des autres membres pour en demander un !"}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Lent items tab content */}
            <TabsContent
              value="lent"
              className="flex flex-col gap-4 mt-0 animate-fade-in"
            >
              {receivedRequests.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {receivedRequests.map((req: any) => (
                    <div
                      key={req.id}
                      className="group relative flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 bg-zinc-50/20 dark:bg-zinc-950/40 border border-border/60 dark:border-zinc-800/80 rounded-2xl shadow-sm hover:border-zinc-350 dark:hover:border-zinc-750 transition-all duration-200"
                    >
                      {/* Item image */}
                      <div className="relative size-16 sm:size-20 rounded-xl overflow-hidden border shrink-0 bg-zinc-950/20 shadow-inner select-none">
                        {req.item?.imageUrl ? (
                          <Image
                            src={req.item.imageUrl}
                            alt={req.item.name}
                            width={128}
                            height={128}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 text-muted-foreground font-black text-xs">
                            ??
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <h4 className="text-sm font-extrabold text-foreground leading-tight truncate">
                          {req.item?.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground leading-none">
                          <span className="flex items-center gap-1">
                            <User className="size-3.5" />
                            {t("loans.borrower")}:{" "}
                            {req.requester?.name || req.requester?.email}
                          </span>
                          <span className="flex items-center gap-1 select-none">
                            <Calendar className="size-3.5" />
                            {new Date(req.createdAt).toLocaleDateString(
                              locale,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </span>
                        </div>
                        {req.notes && (
                          <div className="flex items-start gap-1 p-2 bg-zinc-100/50 dark:bg-zinc-900/50 border border-border/40 rounded-xl max-w-xl mt-1 select-none">
                            <FileText className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                              {req.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Status and Actions */}
                      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 w-full sm:w-auto shrink-0 select-none">
                        {renderStatusBadge(req.status)}

                        {req.status === "PENDING" && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updateStatusMutation.isPending}
                              onClick={() =>
                                handleUpdateStatus(req.id, "REJECTED")
                              }
                              className="rounded-xl h-8 px-3 text-[10px] font-bold border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1"
                            >
                              <XCircle className="size-3" />
                              {t("loans.actions.reject") || "Refuser"}
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              disabled={updateStatusMutation.isPending}
                              onClick={() =>
                                handleUpdateStatus(req.id, "APPROVED")
                              }
                              className="rounded-xl h-8 px-3 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle className="size-3" />
                              {t("loans.actions.accept") || "Accepter"}
                            </Button>
                          </div>
                        )}
                        {req.status === "APPROVED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={updateStatusMutation.isPending}
                            onClick={() =>
                              handleUpdateStatus(req.id, "RETURNED")
                            }
                            className="rounded-xl h-8 px-4 text-[10px] font-bold border-border hover:bg-accent active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1"
                          >
                            <RotateCcw className="size-3" />
                            {t("loans.actions.return") || "Retourné"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-zinc-50/5 dark:bg-zinc-950/20 border border-dashed border-border/80 dark:border-zinc-800/80 rounded-3xl select-none animate-fade-in">
                  <Inbox className="size-10 text-zinc-400 dark:text-zinc-600 mb-3 animate-pulse" />
                  <h3 className="text-sm font-bold text-foreground mb-1">
                    {t("loans.noLentsTitle") || "Aucun prêt actif"}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                    {t("loans.noLentsDesc") ||
                      "Vous n'avez prêté aucun objet pour le moment. Vos demandes reçues apparaîtront ici."}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

export default function LoansPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center text-sm text-muted-foreground">
          Chargement...
        </div>
      }
    >
      <LoansPageComponent />
    </Suspense>
  );
}
