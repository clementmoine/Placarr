import axios from "axios";

import { Prisma, Shelf } from "@prisma/client";

export const getShelves = (): Promise<Shelf[]> => {
  const url = new URL("/api/shelves", window.location.origin);

  return axios.get(url.toString()).then((response) => response.data);
};

export const getShelf = (id?: Shelf["id"]): Promise<Shelf> => {
  if (id == null) {
    throw new Error("Id was not given to getShelf");
  }

  const url = new URL("/api/shelves", window.location.origin);
  url.searchParams.set("id", id);

  return axios.get(url.toString()).then((response) => response.data);
};

export const saveShelf = (
  data: Prisma.ShelfCreateInput | Prisma.ShelfUpdateInput,
): Promise<Shelf> => {
  const url = new URL("/api/shelves", window.location.origin);
  let method: "POST" | "PUT" = "POST";

  if ("id" in data && data.id) {
    url.searchParams.set("id", data.id.toString());
    method = "PUT";
  }

  return axios({
    method,
    url: url.toString(),
    data,
  }).then((response) => response.data);
};
