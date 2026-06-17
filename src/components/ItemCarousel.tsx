import { useMemo, useState } from "react";

import {
  Carousel,
  CarouselItem,
  CarouselContent,
  type CarouselApi,
} from "@/components/ui/carousel";
import { CarouselDots } from "@/components/CarouselDots";
import { Badge } from "@/components/ui/badge";

import type { ItemWithMetadata } from "@/types/items";
import { getGalleryImages, getMediaTypeLabel } from "@/lib/itemMedia";
import Image from "next/image";

interface ItemCarouselProps {
  item: Partial<Pick<ItemWithMetadata, "metadata" | "imageUrl">>;
  className?: string;
  max?: number;
  showTypeBadge?: boolean;
}

export function ItemCarousel(props: ItemCarouselProps) {
  const { item, max, showTypeBadge = false } = props;

  const [api, setApi] = useState<CarouselApi>();

  const images = useMemo(() => getGalleryImages(item, max), [item, max]);

  if (images.length === 0) return null;

  return (
    <Carousel setApi={setApi} opts={{ loop: true }}>
      <CarouselContent>
        {images.map((media) => (
          <CarouselItem key={media.url}>
            <div className="relative">
              <Image
                src={media.url}
                alt="Item image"
                width={512}
                height={512}
                className="h-auto w-full max-h-48 object-contain"
              />
              {showTypeBadge && media.type !== "image" && (
                <Badge
                  variant="secondary"
                  className="absolute top-1 right-1 text-[10px] px-1.5 py-0 opacity-70"
                >
                  {getMediaTypeLabel(media.type)}
                </Badge>
              )}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselDots api={api} />
    </Carousel>
  );
}
