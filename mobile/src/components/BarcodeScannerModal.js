import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Vibration,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function BarcodeScannerModal({ visible, onClose, onScanned }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastScan, setLastScan] = useState(null);

  useEffect(() => {
    if (visible && permission && !permission.granted) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleScan = (result) => {
    if (!result || !result.data) return;

    const now = Date.now();

    if (lastScan && lastScan.data === result.data && now - lastScan.time < 1500) {
      return;
    }

    setLastScan({ data: result.data, time: now });
    Vibration.vibrate(80);
    onScanned(result.data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {permission && permission.granted ? (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={handleScan}
            barcodeSettings={{
              barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr_code"],
            }}
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.centerText}>
              Camera permission is required to scan barcodes.
            </Text>
          </View>
        )}

        <View style={styles.topBar}>
          <Text style={styles.title}>Scan Barcode</Text>
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.frame, { pointerEvents: "none" }]}>
          <View style={styles.frameLine} />
        </View>

        <View style={styles.bottomHint}>
          <Text style={styles.hintText}>
            Point camera at barcode. Items are added automatically.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30 },
  centerText: { color: "#fff", textAlign: "center" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  doneButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  doneText: { color: "#fff", fontWeight: "bold" },
  frame: {
    position: "absolute",
    top: "35%",
    left: "15%",
    right: "15%",
    height: "20%",
    borderWidth: 2,
    borderColor: "#22c55e",
    borderRadius: 12,
    justifyContent: "center",
  },
  frameLine: { height: 2, backgroundColor: "#22c55e" },
  bottomHint: { position: "absolute", bottom: 40, left: 20, right: 20, alignItems: "center" },
  hintText: { color: "#e2e8f0", textAlign: "center" },
});
