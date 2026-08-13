import AsyncStorage from "@react-native-async-storage/async-storage";

const OFFLINE_ORDERS_KEY = "@pos_offline_orders";

export async function getOfflineOrders() {
  try {
    const jsonValue = await AsyncStorage.getItem(OFFLINE_ORDERS_KEY);

    if (!jsonValue) return [];

    const orders = JSON.parse(jsonValue);

    return Array.isArray(orders) ? orders : [];
  } catch (error) {
    console.error("Failed to read offline orders:", error);
    return [];
  }
}

export async function saveOfflineOrders(orders) {
  try {
    await AsyncStorage.setItem(OFFLINE_ORDERS_KEY, JSON.stringify(orders));
  } catch (error) {
    console.error("Failed to save offline orders:", error);
  }
}

export async function addOfflineOrder(order) {
  const orders = await getOfflineOrders();
  orders.push(order);
  await saveOfflineOrders(orders);
  return order;
}
