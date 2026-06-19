"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import {
  Compass,
  User,
  Clock,
  MessageSquare,
  Calendar,
  Building,
  Check,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import Image from "next/image";

import { BaseModal } from "./BaseModal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import { useLocale } from "@/lib/providers/LocaleProvider";
import { useAccount } from "@/lib/hooks/useAccount";
import { cn } from "@/lib/utils";
import { getHeroImage, getGalleryImages } from "@/lib/itemMedia";
import { getExploreDetailCoverClass } from "@/lib/cardFormat";

interface ExploreItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any; // Explore item result
}

export function ExploreItemModal({
  isOpen,
  onClose,
  item,
}: ExploreItemModalProps) {
  const { t, locale } = useLocale();
  const queryClient = useQueryClient();

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: loanData, isFetching: isFetchingLoans } = useQuery({
    queryKey: ["loans"],
    queryFn: async () => {
      const { data } = await axios.get("/api/loans");
      return data;
    },
    enabled: isOpen,
  });

  const alreadyRequested = useMemo(() => {
    if (!loanData || !item) return false;
    return loanData.sent.some(
      (req: any) =>
        req.itemId === item.id && ["PENDING", "APPROVED"].includes(req.status),
    );
  }, [loanData, item]);

  const activeRequest = useMemo(() => {
    if (!loanData || !item) return null;
    return loanData.sent.find(
      (req: any) =>
        req.itemId === item.id && ["PENDING", "APPROVED"].includes(req.status),
    );
  }, [loanData, item]);

  const createLoanMutation = useMutation({
    mutationFn: async (payload: { itemId: string; notes?: string }) => {
      const { data } = await axios.post("/api/loans", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      toast.success(t("loans.success") || "Demande de prêt envoyée !");
      setShowRequestForm(false);
      setNotes("");
    },
    onError: (err: any) => {
      const errMsg = err.response?.data?.error || t("common.error");
      toast.error(errMsg);
    },
  });

  const cancelLoanMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await axios.patch("/api/loans", {
        id,
        status: "REJECTED",
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      toast.success(t("common.success") || "Action réussie");
    },
    onError: (err: any) => {
      toast.error(t("common.error"));
    },
  });

  if (!item) return null;

  const heroImage = item.backgroundImageUrl || getHeroImage(item);
  const coverImage = item.imageUrl ?? null;
  const galleryImages = getGalleryImages(item).filter(
    (img) => img.url !== coverImage,
  );

  const coverAspectRatio = () => {
    return getExploreDetailCoverClass(item.shelf?.cardFormat, item.shelf?.type);
  };

  const handleRequestSubmit = () => {
    createLoanMutation.mutate({ itemId: item.id, notes });
  };

  const handleCancelRequest = () => {
    if (activeRequest) {
      cancelLoanMutation.mutate(activeRequest.id);
    }
  };

  const renderFooter = () => {
    if (showRequestForm) {
      return (
        <div className="flex items-center justify-end gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRequestForm(false)}
            className="rounded-xl h-10 px-5 text-xs font-semibold"
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleRequestSubmit}
            disabled={createLoanMutation.isPending}
            className="rounded-xl h-10 px-5 text-xs font-semibold bg-primary hover:bg-primary/95 shadow-sm active:scale-[0.98]"
          >
            {createLoanMutation.isPending && (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            )}
            {t("loans.sendRequest") || "Envoyer"}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-end gap-2 w-full">
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="rounded-xl h-10 px-5 text-xs font-semibold"
        >
          {t("common.close")}
        </Button>
        {alreadyRequested ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancelRequest}
            disabled={cancelLoanMutation.isPending}
            className="rounded-xl h-10 px-5 text-xs font-semibold active:scale-[0.98]"
          >
            {cancelLoanMutation.isPending && (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            )}
            {t("loans.actions.cancel") || "Annuler la demande"}
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowRequestForm(true)}
            className="rounded-xl h-10 px-5 text-xs font-semibold bg-primary hover:bg-primary/95 shadow-sm active:scale-[0.98]"
          >
            {t("loans.requestLoan") || "Demander l'emprunt"}
          </Button>
        )}
      </div>
    );
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Compass className="size-5 text-primary" />
          <span>{item.name}</span>
        </div>
      }
      description={
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="bg-zinc-500/10 gap-1 border-none capitalize py-0.5 text-[10px] select-none font-bold text-muted-foreground leading-none"
          >
            <ShelfTypeIcon type={item.shelf?.type} className="size-3" />
            {t(`shelf.type.${item.shelf?.type}`)}
          </Badge>
          <Badge
            variant="outline"
            className="bg-zinc-500/10 border-none select-none font-bold py-0.5 text-[10px] text-muted-foreground leading-none"
          >
            {t(`items.conditions.${item.condition}`)}
          </Badge>
          <Badge
            variant="outline"
            className="bg-amber-500/10 border-none select-none font-bold py-0.5 text-[10px] text-amber-600 dark:text-amber-400 leading-none"
          >
            {t("loans.owner")}: {item.user?.name || item.user?.email}
          </Badge>
        </div>
      }
      size="lg"
      footer={renderFooter()}
    >
      <div className="relative flex flex-col gap-6">
        {/* Backdrop visual */}
        {heroImage && (
          <div className="absolute -top-6 -left-6 -right-6 h-[200px] pointer-events-none -z-10 overflow-hidden select-none opacity-20 blur-sm rounded-t-2xl">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
          </div>
        )}

        {showRequestForm ? (
          <div className="flex flex-col gap-4 py-4 animate-fade-in">
            <h3 className="text-sm font-bold text-foreground">
              {t("loans.requestLoan") || "Demander l'emprunt"}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Vous demandez à emprunter <strong>{item.name}</strong> auprès de{" "}
              <strong>{item.user?.name || item.user?.email}</strong>.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                {t("loans.notes") || "Remarques (ex: durée, état)"}
              </label>
              <Textarea
                placeholder="Indiquez par exemple combien de temps vous souhaitez l'emprunter..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-xs rounded-xl border-border bg-background resize-none min-h-[100px] focus-visible:ring-1"
                maxLength={400}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
            {/* Left Cover aspect */}
            <div
              className={cn(
                "relative mx-auto md:mx-0 rounded-2xl overflow-hidden shadow-xl border border-border dark:border-zinc-800/80 shrink-0 select-none bg-zinc-950/20",
                coverAspectRatio(),
              )}
            >
              {coverImage ? (
                <Image
                  src={coverImage}
                  alt={item.name}
                  width={300}
                  height={300}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-950 text-muted-foreground p-6 gap-3 min-h-[200px]">
                  <ShelfTypeIcon
                    type={item.shelf?.type}
                    className="size-12 text-zinc-400 dark:text-zinc-500"
                  />
                </div>
              )}
            </div>

            {/* Right details */}
            <div className="flex-1 w-full flex flex-col gap-4">
              {item.metadata?.title && item.metadata.title !== item.name && (
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-none">
                    Titre Original
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {item.metadata.title}
                  </span>
                </div>
              )}

              {/* Creators & publishers */}
              <div className="grid grid-cols-2 gap-4">
                {item.metadata?.authors && item.metadata.authors.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-none flex items-center gap-1">
                      <User className="size-3" />
                      Créateurs
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate">
                      {item.metadata.authors.map((a: any) => a.name).join(", ")}
                    </span>
                  </div>
                )}
                {item.metadata?.publishers &&
                  item.metadata.publishers.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-none flex items-center gap-1">
                        <Building className="size-3" />
                        Éditeurs
                      </span>
                      <span className="text-xs font-semibold text-foreground truncate">
                        {item.metadata.publishers
                          .map((p: any) => p.name)
                          .join(", ")}
                      </span>
                    </div>
                  )}
              </div>

              {item.metadata?.releaseDate && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-none flex items-center gap-1">
                    <Calendar className="size-3" />
                    Date de Sortie
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    {new Date(item.metadata.releaseDate).toLocaleDateString(
                      locale,
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                  </span>
                </div>
              )}

              {item.shelf?.type === "games" && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-none flex items-center gap-1 select-none">
                    PriceCharting
                  </span>
                  <a
                    href={`https://www.pricecharting.com/fr/search-products?type=videogames&q=${encodeURIComponent(item.name || "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <Clock className="size-3" />
                    Voir la cote
                  </a>
                </div>
              )}

              {/* Description */}
              {(item.description || item.metadata?.description) && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-none flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    Description
                  </span>
                  <p className="text-xs leading-relaxed text-muted-foreground line-clamp-6">
                    {item.description || item.metadata.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Gallery Screenshots */}
        {!showRequestForm && galleryImages.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider leading-none flex items-center gap-1">
              <ImageIcon className="size-3.5" />
              Illustrations & Captures
            </span>
            <div className="flex gap-3 overflow-x-auto pb-1 max-w-full scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {galleryImages.map((img, i) => (
                <div
                  key={i}
                  className="relative h-20 aspect-video rounded-lg overflow-hidden border border-border dark:border-zinc-800/80 shrink-0 bg-zinc-950/20"
                >
                  <Image
                    src={img.url}
                    alt={`Illustration ${i + 1}`}
                    width={200}
                    height={120}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
