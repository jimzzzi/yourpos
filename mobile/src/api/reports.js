import { api } from "./client";

export const reportsApi = {
  getDashboard: async (days, bh) => {
    const res = await api.get("/reports/dashboard", {
      params: {
        days,
        open: bh ? bh.open : undefined,
        close: bh ? bh.close : undefined,
      },
    });
    return res.data;
  },
};