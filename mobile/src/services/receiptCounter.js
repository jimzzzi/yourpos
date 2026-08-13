import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "yourpos_receipt_counter";

export async function nextReceiptNumber(settings) {
  const rc = (settings && settings.receipt) || {};
  const start = Math.max(1, Number(rc.counterStart || 1));
  const mode = rc.counterMode === "daily" ? "daily" : "continuous";

  let state = { value: 0, date: "" };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) {}

  const today = new Date().toISOString().slice(0, 10);
  let next;

  if (mode === "daily") {
    // New day -> restart from the start number
    if (state.date !== today) {
      next = start;
    } else {
      next = Number(state.value || 0) + 1;
      if (next < start) next = start;
    }
  } else {
    // Continuous -> never resets
    next = Number(state.value || 0) + 1;
    if (next < start) next = start;
  }

  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ value: next, date: today }));
  } catch (e) {}

  return next;
}