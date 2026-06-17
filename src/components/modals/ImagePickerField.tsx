"use client";

import React, { useState } from "react";
import {
  Upload,
  Link as LinkIcon,
  X,
  Check,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isUrl } from "@/lib/isUrl";
import { toast } from "sonner";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

interface ImagePickerFieldProps {
  value: any;
  onChange: (value: any) => void;
  onFileChange?: (file: File | string | null) => void;
  label?: string;
  placeholder?: string;
  suggestions?: {
    url: string;
    label: string;
    source?: string | null;
    role?: string | null;
  }[];
  chooseImageText?: string;
  enterUrlText?: string;
  urlPlaceholderText?: string;
  suggestedImagesText?: string;
  invalidUrlText?: string;
  previewBgColor?: string;
  onViewMore?: () => void;
  viewMoreLabel?: string;
  aspectRatio?: string;
  contain?: boolean;
}

export function ImagePickerField({
  value,
  onChange,
  onFileChange,
  label,
  placeholder = "Pas d'image",
  suggestions = [],
  chooseImageText = "Importer",
  enterUrlText = "Saisir une URL",
  urlPlaceholderText = "https://example.com/image.jpg",
  suggestedImagesText = "Images suggérées",
  invalidUrlText = "URL invalide",
  previewBgColor,
  onViewMore,
  viewMoreLabel = "Voir plus",
  aspectRatio,
  contain = false,
}: ImagePickerFieldProps) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState("");

  const isFileObj = typeof File !== "undefined" && value instanceof File;

  let previewSrc = "";
  if (typeof value === "string" && value.trim() !== "") {
    previewSrc = value;
  } else if (isFileObj && typeof window !== "undefined") {
    previewSrc = URL.createObjectURL(value);
  }

  const hasImage = !!previewSrc;

  const handleClear = () => {
    onChange(null);
    if (onFileChange) onFileChange(null);
  };

  const handleSelectSuggestion = (url: string) => {
    onChange(url);
    if (onFileChange) onFileChange(url);
  };

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
          {label}
        </span>
      )}
      <div className="flex flex-col sm:flex-row gap-4 items-start bg-zinc-50/50 dark:bg-zinc-950/20 border border-border/80 rounded-2xl p-4 w-full">
        {/* Left: Preview Card */}
        <div
          className={cn(
            "relative group/cover w-28 rounded-xl overflow-hidden border border-border bg-zinc-950/10 flex flex-col items-center justify-center shrink-0 shadow-sm transition-all duration-300",
            !aspectRatio && "aspect-[1/1.4]",
          )}
          style={{ backgroundColor: previewBgColor, aspectRatio }}
        >
          {hasImage ? (
            <>
              <Image
                src={previewSrc}
                alt="Preview"
                width={512}
                height={512}
                className={cn(
                  "w-full h-full",
                  contain ? "object-contain p-2" : "object-cover",
                )}
              />
              <button
                type="button"
                onClick={handleClear}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover/cover:opacity-100 flex items-center justify-center transition-all duration-200 text-white rounded-xl cursor-pointer border-none"
              >
                <X className="size-6" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-zinc-450 dark:text-zinc-500 text-[10px] text-center font-bold px-2">
              <ImageIcon className="size-6 text-zinc-400" />
              <span>{placeholder}</span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex-1 flex flex-col gap-3 w-full min-w-0">
          <div className="flex flex-wrap gap-2">
            {/* File upload trigger */}
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="reusable-image-picker-file"
                onChange={async (e) => {
                  const file = e.target.files?.[0] || null;
                  if (file) {
                    onChange(file);
                    if (onFileChange) onFileChange(file);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  document.getElementById("reusable-image-picker-file")?.click()
                }
                className="flex items-center gap-1.5 text-xs h-9 rounded-lg"
              >
                <Upload className="size-3.5" />
                {chooseImageText}
              </Button>
            </div>

            {/* URL entry trigger */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="flex items-center gap-1.5 text-xs h-9 rounded-lg"
            >
              <LinkIcon className="size-3.5" />
              {enterUrlText}
            </Button>
          </div>

          {showUrlInput && (
            <div className="flex items-center gap-2 p-2 bg-zinc-950/20 dark:bg-zinc-950/30 border border-border rounded-xl animate-fade-in w-full">
              <Input
                type="text"
                placeholder={urlPlaceholderText}
                value={urlInputValue}
                onChange={(e) => setUrlInputValue(e.target.value)}
                className="flex-1 text-xs bg-background text-foreground h-8 rounded-lg"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (urlInputValue.trim()) {
                    if (isUrl(urlInputValue.trim())) {
                      onChange(urlInputValue.trim());
                      if (onFileChange) onFileChange(urlInputValue.trim());
                      setUrlInputValue("");
                      setShowUrlInput(false);
                    } else {
                      toast.error(invalidUrlText);
                    }
                  }
                }}
                className="text-xs h-8 rounded-lg px-3"
              >
                OK
              </Button>
            </div>
          )}

          {/* Suggestions list */}
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                {suggestedImagesText} ({suggestions.length})
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1 max-w-full scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {(onViewMore && suggestions.length > 8
                  ? suggestions.slice(0, 8)
                  : suggestions
                ).map((img, i) => {
                  const isSelected = value === img.url;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectSuggestion(img.url)}
                      className={cn(
                        "relative w-12 rounded-lg overflow-hidden border-2 bg-zinc-950/10 cursor-pointer transition-all duration-200 shrink-0",
                        !aspectRatio && "aspect-[1/1.4]",
                        isSelected
                          ? "border-amber-600 dark:border-amber-500 shadow-sm ring-1 ring-amber-600/30"
                          : "border-border/60 hover:border-zinc-400",
                      )}
                      style={{ aspectRatio }}
                    >
                      <Image
                        src={img.url}
                        alt={img.label}
                        width={512}
                        height={512}
                        className={cn(
                          "w-full h-full",
                          contain ? "object-contain p-1" : "object-cover",
                        )}
                      />

                      {/* Selection Checkmark */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-amber-600/10 dark:bg-amber-500/10 flex items-center justify-center">
                          <div className="bg-amber-600 dark:bg-amber-500 text-white rounded-full p-0.5 shadow-sm">
                            <Check className="size-2" />
                          </div>
                        </div>
                      )}

                      {/* Source badge overlay */}
                      {img.source && (
                        <div className="absolute top-0.5 left-0.5 flex flex-col gap-0.5 pointer-events-none select-none">
                          <Badge
                            variant="secondary"
                            className="bg-black/85 backdrop-blur text-[6px] font-extrabold border-none text-amber-400 uppercase px-1 py-0 rounded leading-none"
                          >
                            {img.source}
                          </Badge>
                        </div>
                      )}
                    </button>
                  );
                })}
                {onViewMore && suggestions.length > 8 && (
                  <button
                    type="button"
                    onClick={onViewMore}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 w-12 rounded-lg border border-dashed border-border/80 hover:border-zinc-450 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 text-zinc-450 dark:text-zinc-500 shrink-0 cursor-pointer select-none transition-all duration-200",
                      !aspectRatio && "aspect-[1/1.4]",
                    )}
                    style={{ aspectRatio }}
                  >
                    <span className="text-[8px] font-black uppercase tracking-wider text-center leading-tight">
                      {viewMoreLabel.split(" ").join("\n")}
                    </span>
                    <span className="text-[8px] font-bold text-muted-foreground leading-none">
                      ({suggestions.length})
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
