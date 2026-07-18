"use client";

import { useEffect } from "react";

const APP_TITLE = "Placarr";

/**
 * Sets `document.title` for client pages (item/shelf detail) where we
 * cannot use `generateMetadata` because the route is a client component.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    const previous = document.title;
    const trimmed = title?.trim();
    document.title = trimmed ? `${trimmed} · ${APP_TITLE}` : APP_TITLE;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
