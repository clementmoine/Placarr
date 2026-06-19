import type { SyntheticEvent } from "react";
import Image from "next/image";

function isExternalImageSrc(src: string) {
  return /^https?:\/\//i.test(src) || src.startsWith("blob:");
}

export function RemoteImage({
  src,
  alt,
  className,
  width = 512,
  height = 512,
  onLoad,
}: {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  if (isExternalImageSrc(src)) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        referrerPolicy="no-referrer"
        onLoad={onLoad}
        draggable={false}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onLoad={onLoad}
      draggable={false}
    />
  );
}
