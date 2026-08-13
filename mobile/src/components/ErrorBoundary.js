import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error ? error.message : "Unknown error" };
  }

  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>🛠</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.message}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ hasError: false, message: "" })}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F1F5F9", padding: 30 },
  icon: { fontSize: 50, marginBottom: 15 },
  title: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 8 },
  message: { color: "#64748B", textAlign: "center", marginBottom: 25 },
  button: { backgroundColor: "#43A047", borderRadius: 10, paddingHorizontal: 30, paddingVertical: 14 },
  buttonText: { color: "#fff", fontWeight: "bold" },
});