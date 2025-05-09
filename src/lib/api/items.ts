import axios from "axios";

import type { Prisma, Item } from "@prisma/client";

export const getItem = (id?: Item["id"]): Promise<Item> => {
  if (id == null) {
    throw new Error("Id was not given to getItem");
  }

  const url = new URL("/api/items", window.location.origin);
  url.searchParams.set("id", id);

  return axios.get(url.toString()).then((response) => response.data);
};

export const saveItem = (
  data: Prisma.ItemCreateInput | Prisma.ItemUpdateInput,
): Promise<Item> => {
  const url = new URL("/api/items", window.location.origin);
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

export const deleteItem = (id: Item["id"]): Promise<void> => {
  if (id == null) {
    throw new Error("Id was not given to deleteItem");
  }

  const url = new URL("/api/items", window.location.origin);
  url.searchParams.set("id", id.toString());

  return axios.delete(url.toString()).then(() => {});
};
