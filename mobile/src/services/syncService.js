import NetInfo from "@react-native-community/netinfo";
import { api } from "../api/client";
import { getOfflineOrders, saveOfflineOrders } from "./offlineQueue";

let isSyncing = false;

export async function syncOfflineOrders() {
  if (isSyncing) return;

  try {
    const netInfo = await NetInfo.fetch();

    if (!netInfo.isConnected) return;

    const offlineOrders = await getOfflineOrders();

    if (!offlineOrders.length) return;

    isSyncing = true;

    const response = await api.post("/sync/orders", { orders: offlineOrders });

    const results = response.data?.results || [];

    const syncedClientOrderIds = new Set(
      results.map((result) => result.client_order_id).filter(Boolean)
    );

    const remainingOrders = offlineOrders.filter(
      (order) => !syncedClientOrderIds.has(order.client_order_id)
    );

    await saveOfflineOrders(remainingOrders);

    console.log("Sync complete. Remaining offline orders: " + remainingOrders.length);
  } catch (error) {
    console.error("Sync failed:", error);
  } finally {
    isSyncing = false;
  }
}
