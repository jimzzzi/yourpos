import React, { useState, useEffect, useRef } from "react";
import { TextInput } from "react-native";

export default function HardwareScannerInput({ onBarcode, active }) {
  const [buffer, setBuffer] = useState("");
  const inputRef = useRef(null);
  const lastKeyTime = useRef(0);
  const BUFFER_TIMEOUT = 50; // ms between keystrokes to detect scanner

  // 🔍 Auto-focus when scanner mode is activated
  useEffect(() => {
    if (active && inputRef.current) {
      setTimeout(() => {
        try {
          inputRef.current.focus();
        } catch (e) {
          console.error("Focus error:", e);
        }
      }, 100);
    }
  }, [active]);

  // 🔍 Handle each keystroke
  const handleKeyPress = (event) => {
    if (!active) return;

    const now = Date.now();
    const key = event.nativeEvent?.key || event.key || "";

    // Enter key = end of barcode
    if (key === "Enter") {
      if (buffer.length >= 3) {
        console.log("🔍 Barcode scanned:", buffer);
        onBarcode(buffer);
      }
      // Clear buffer and re-focus for next scan
      setBuffer("");
      setTimeout(() => {
        try {
          if (inputRef.current) inputRef.current.focus();
        } catch (e) {}
      }, 50);
      return;
    }

    // Only accept printable characters
    if (key.length === 1) {
      const timeDiff = now - lastKeyTime.current;
      lastKeyTime.current = now;

      // If too much time passed, reset buffer (human typing, not scanner)
      if (timeDiff > BUFFER_TIMEOUT && buffer.length > 0) {
        setBuffer(key);
      } else {
        setBuffer((prev) => prev + key);
      }
    }
  };

  // 🔍 Also handle onChange for some scanners that don't send Enter
  const handleChange = (text) => {
    if (!active) return;
    
    // Some scanners paste the entire barcode at once
    if (text.length >= 6 && text !== buffer) {
      console.log("🔍 Barcode detected via paste:", text);
      onBarcode(text);
      setBuffer("");
      setTimeout(() => {
        try {
          if (inputRef.current) inputRef.current.focus();
        } catch (e) {}
      }, 50);
      return;
    }
    setBuffer(text);
  };

  if (!active) return null;

  return (
    <TextInput
      ref={inputRef}
      value={buffer}
      onChangeText={handleChange}
      onKeyPress={handleKeyPress}
      style={{
        position: "absolute",
        opacity: 0,
        width: 1,
        height: 1,
        top: 0,
        left: 0,
        zIndex: -1,
      }}
      autoFocus
      showSoftInputOnFocus={false}
      keyboardType="default"
      autoCapitalize="none"
      autoCorrect={false}
      blurOnSubmit={false}
      onSubmitEditing={() => {
        // Re-focus after Enter
        setTimeout(() => {
          try {
            if (inputRef.current) inputRef.current.focus();
          } catch (e) {}
        }, 50);
      }}
    />
  );
}