import { api } from "./client";

export const telegramApi = {
  getConfig: async () => (await api.get("/telegram/config")).data,
  saveConfig: async (token, chatId) => (await api.post("/telegram/config", { token, chatId })).data,
  sendReport: async (days, symbol) => (await api.post("/telegram/send", { days, symbol })).data,
  sendTest: async () => (await api.post("/telegram/test")).data,
};