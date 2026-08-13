import { api } from "./client";

export const backofficeApi = {
  async getModifiers() {
    const r = await api.get("/modifiers");
    return r.data;
  },
  async createModifier(payload) {
    const r = await api.post("/modifiers", payload);
    return r.data;
  },
  async updateModifier(id, payload) {
    const r = await api.put("/modifiers/" + id, payload);
    return r.data;
  },
  async deleteModifier(id) {
    const r = await api.delete("/modifiers/" + id);
    return r.data;
  },
  async getStore() {
    const r = await api.get("/store");
    return r.data;
  },
  async updateStoreSettings(payload) {
    const r = await api.put("/store/settings", payload);
    return r.data;
  },
  async getSummary(days) {
    const r = await api.get("/analytics/summary", { params: { days } });
    return r.data;
  },
  async getTopProducts(days) {
    const r = await api.get("/analytics/top-products", { params: { days } });
    return r.data;
  },
  async getPayments(days) {
    const r = await api.get("/analytics/payments", { params: { days } });
    return r.data;
  },
  async getCategoriesReport(days) {
    const r = await api.get("/analytics/categories", { params: { days } });
    return r.data;
  },
  async getHourly(days) {
    const r = await api.get("/analytics/hourly", { params: { days } });
    return r.data;
  },
  async getSales(days) {
    const r = await api.get("/analytics/sales", { params: { days } });
    return r.data;
  },
  async addCashMovement(payload) {
    const r = await api.post("/cash/movements", payload);
    return r.data;
  },
  async getCashMovements(days) {
    const r = await api.get("/cash/movements", { params: { days } });
    return r.data;
  },
  async getCashSummary(days) {
    const r = await api.get("/cash/summary", { params: { days } });
    return r.data;
  },
  async getZReport(days) {
    const r = await api.get("/analytics/zreport", { params: { days } });
    return r.data;
  },
  async resetFull(password) {
    const r = await api.post("/admin/reset/full", { password });
    return r.data;
  },
  async resetSales(password) {
    const r = await api.post("/admin/reset/sales", { password });
    return r.data;
  },
  async getTables() {
    const r = await api.get("/tables");
    return r.data;
  },
  async createTable(name) {
    const r = await api.post("/tables", { name });
    return r.data;
  },
  async deleteTable(id) {
    const r = await api.delete("/tables/" + id);
    return r.data;
  },
  async saveTableOrder(tableId, items, note) {
    const r = await api.put("/tables/" + tableId + "/order", { items, note });
    return r.data;
  },
  async clearTableOrder(tableId) {
    const r = await api.delete("/tables/" + tableId + "/order");
    return r.data;
  },
};