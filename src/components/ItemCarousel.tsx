import Image from "next/image";
import { useMemo, useState } from "react";

import {
  Carousel,
  CarouselItem,
  CarouselContent,
  type CarouselApi,
} from "@/components/ui/carousel";
import { CarouselDots } from "@/components/CarouselDots";

import type { ItemWithMetadata } from "@/types/items";

interface ItemCarouselProps {
  item: Partial<Pick<ItemWithMetadata, "metadata" | "imageUrl">>;
  className?: string;
  max?: number;
}

export function ItemCarousel(props: ItemCarouselProps) {
  const { item, max } = props;

  const [api, setApi] = useState<CarouselApi>();

  const images = useMemo(() => {
    const urls = new Set<string>();

    if (item?.imageUrl) urls.add(item.imageUrl);
    if (item?.metadata?.imageUrl && item.metadata.imageUrl !== item.imageUrl) {
      urls.add(item.metadata.imageUrl);
    }

    item?.metadata?.attachments?.forEach((att) => {
      if (
        att.type === "image" &&
        att.url !== item?.imageUrl &&
        att.url !== item?.metadata?.imageUrl
      ) {
        urls.add(att.url);
      }
    });

    const all = Array.from(urls);
    return max ? all.slice(0, max) : all;
  }, [item, max]);

  return (
    <Carousel setApi={setApi} opts={{ loop: true }}>
      <CarouselContent>
        {images.map((url) => (
          <CarouselItem key={url}>
            <Image
              src={url}
              alt="Item image"
              width={250}
              height={250}
              className="h-auto w-full max-h-48 object-contain"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselDots api={api} />
    </Carousel>
  );
}
