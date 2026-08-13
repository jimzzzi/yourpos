import { api } from "./client";

export const usersApi = {
  me: async () => (await api.get("/users/me")).data,
  getGroups: async () => (await api.get("/users/groups")).data,
  createGroup: async (payload) => (await api.post("/users/groups", payload)).data,
  updateGroup: async (id, payload) => (await api.put("/users/groups/" + id, payload)).data,
  deleteGroup: async (id) => (await api.delete("/users/groups/" + id)).data,
  getUsers: async () => (await api.get("/users")).data,
  createUser: async (payload) => (await api.post("/users", payload)).data,
  updateUser: async (id, payload) => (await api.put("/users/" + id, payload)).data,
  deleteUser: async (id) => (await api.delete("/users/" + id)).data,
};