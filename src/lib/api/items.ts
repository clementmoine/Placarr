import axios from "axios";

import type { Item } from "@/generated/prisma";

export const getItem = (id: Item["id"]): Promise<Item> => {
  const url = new URL("/api/items", window.location.origin);
  url.searchParams.set("id", id);

  return axios.get(url.toString()).then((response) => response.data);
};

export const addShelf = (data: Item): Promise<Item> => {
  const url = new URL("/api/items", window.location.origin);

  return axios.post(url.toString(), data).then((response) => response.data);
};

export const updateItem = (id: Item["id"], data: Item): Promise<Item> => {
  const url = new URL("/api/items", window.location.origin);
  url.searchParams.set("id", id);

  return axios.put(url.toString(), data).then((response) => response.data);
};
