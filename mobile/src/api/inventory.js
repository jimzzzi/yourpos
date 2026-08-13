import { api } from "./client";

export const inventoryApi = {
  async getProducts(search = "") {
    const response = await api.get("/inventory/products", {
      params: { search },
    });
    return response.data;
  },

  async createProduct(product) {
    const response = await api.post("/inventory/products", product);
    return response.data;
  },

  async updateProduct(productId, product) {
    const response = await api.put(
      "/inventory/products/" + productId,
      product
    );
    return response.data;
  },

  async deleteProduct(productId) {
    const response = await api.delete("/inventory/products/" + productId);
    return response.data;
  },

  async getCategories() {
    const response = await api.get("/categories");
    return response.data;
  },

  async createCategory(category) {
    const response = await api.post("/categories", category);
    return response.data;
  },

  async lookupBarcode(barcode) {
    const response = await api.get("/inventory/lookup", {
      params: { barcode },
    });
    return response.data;
  },
};
