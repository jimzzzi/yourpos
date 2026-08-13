import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { syncOfflineOrders } from "../services/syncService";

export function useOfflineSync(enabled) {
  useEffect(() => {
    if (!enabled) return;

    syncOfflineOrders();

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        syncOfflineOrders();
      }
    });

    const interval = setInterval(() => {
      syncOfflineOrders();
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [enabled]);
}
