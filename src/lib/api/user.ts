import axios from "axios";
import { type User } from "@prisma/client";

export async function updateUser(data: {
  name?: string;
  email?: string;
  password?: string;
  image?: string | null;
}): Promise<User> {
  const response = await axios.patch("/api/users", data);
  return response.data;
}

export async function deleteUser(): Promise<void> {
  const response = await axios.delete("/api/users");
  return response.data;
}
