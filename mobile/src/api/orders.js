import { api } from "./client";

export const ordersApi = {
  async getOrders(limit = 50) {
    const response = await api.get("/orders", {
      params: { limit },
    });
    return response.data;
  },

  async getOrderDetail(id) {
    const response = await api.get("/orders/" + id);
    return response.data;
  },

  async refundOrder(id, reason) {
    const response = await api.post("/orders/" + id + "/refund", { reason });
    return response.data;
  },
};