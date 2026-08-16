import { api } from "./client";

export const reportsApi = {
  getDashboard: async (rangeOrDays, bh) => {
    // Support both {from, to} object OR a number (days) for backward compatibility
    const params = {};
    
    if (rangeOrDays && typeof rangeOrDays === "object" && rangeOrDays.from && rangeOrDays.to) {
      params.from = rangeOrDays.from;
      params.to = rangeOrDays.to;
    } else {
      params.days = rangeOrDays || 7;
    }
    
    if (bh) {
      if (bh.open) params.open = bh.open;
      if (bh.close) params.close = bh.close;
    }
    
    const res = await api.get("/reports/dashboard", { params });
    return res.data;
  },
};