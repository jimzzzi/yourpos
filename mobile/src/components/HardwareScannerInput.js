import React, { useRef, useState, useEffect } from "react";
import { TextInput, StyleSheet, Platform } from "react-native";

export default function HardwareScannerInput({ onBarcode, active = true }) {
  const inputRef = useRef(null);
  const [buffer, setBuffer] = useState("");

  useEffect(() => {
    if (Platform.OS === "web") return;

    if (active) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [active]);

  if (Platform.OS === "web") return null;

  return (
    <TextInput
      ref={inputRef}
      style={styles.hiddenInput}
      value={buffer}
      onChangeText={setBuffer}
      autoFocus
      showSoftInputOnFocus={false}
      autoCapitalize="none"
      autoCorrect={false}
      blurOnSubmit={true}
      returnKeyType="done"
      onBlur={() => {
        if (active) {
          setTimeout(() => {
            inputRef.current?.focus();
          }, 200);
        }
      }}
      onSubmitEditing={() => {
        const code = buffer.trim();
        setBuffer("");
        if (code) onBarcode(code);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }}
    />
  );
}

const styles = StyleSheet.create({
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    top: 0,
    left: 0,
  },
});