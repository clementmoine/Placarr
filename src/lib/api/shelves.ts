import axios from "axios";

import type { Prisma, Shelf } from "@prisma/client";
import type { ShelfWithItemCount, ShelfWithItems } from "@/types/shelves";

export const getShelves = (
  search?: string | null,
): Promise<ShelfWithItemCount[]> => {
  const url = new URL("/api/shelves", window.location.origin);

  if (search && search.length >= 1) {
    url.searchParams.set("q", search);
  }

  return axios.get(url.toString()).then((response) => response.data);
};

export const getShelf = (
  id?: Shelf["id"],
  search?: string | null,
): Promise<ShelfWithItems> => {
  if (id == null) {
    throw new Error("Id was not given to getShelf");
  }
  const url = new URL("/api/shelves", window.location.origin);

  if (search && search.length >= 1) {
    url.searchParams.set("q", search);
  }

  url.searchParams.set("id", id);

  return axios.get(url.toString()).then((response) => response.data);
};

export const saveShelf = (
  data: Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput,
): Promise<ShelfWithItems> => {
  const url = new URL("/api/shelves", window.location.origin);
  let method: "POST" | "PATCH" = "POST";

  if ("id" in data && data.id) {
    url.searchParams.set("id", data.id.toString());
    method = "PATCH";
  }

  return axios({
    method,
    url: url.toString(),
    data,
  }).then((response) => response.data);
};

export const deleteShelf = (id: Shelf["id"]): Promise<void> => {
  if (id == null) {
    throw new Error("Id was not given to deleteShelf");
  }

  const url = new URL("/api/shelves", window.location.origin);
  url.searchParams.set("id", id.toString());

  return axios.delete(url.toString()).then(() => {});
};
