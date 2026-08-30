  // ===== CONFIRM PAYMENT =====
  const confirmPayment = async () => {
    if (!payModalOrder || processing) return;
    setProcessing(true);
    try {
      const billNumber = await nextReceiptNumber(settings);

      let payment;
      if (paymentMethod === "cash") {
        payment = { payment_method: "cash", amount_tendered: tenderedValue, change_due: changeDue, payments: [{ method: "cash", amount: orderTotal }] };
      } else if (paymentMethod === "card") {
        payment = { payment_method: "card", amount_tendered: orderTotal, change_due: 0, payments: [{ method: "card", amount: orderTotal }] };
      } else {
        payment = { payment_method: "split", amount_tendered: orderTotal, change_due: 0, payments: [{ method: "cash", amount: splitCashNum }, { method: "card", amount: splitCard }] };
      }

      // Build cart items for createOrder
      const cartItems = (payModalOrder.items || []).map((i) => ({
        variant_id: i.variant_id,
        product_id: i.product_id,
        category_id: i.category_id,
        name: i.name || "Item",
        price: Number(i.price || 0),
        quantity: Number(i.quantity || 1),
        modifiers: i.modifiers || [],
        is_time_based: false,
      }));

      await createOrder({
        cart: cartItems,
        subtotal: Number(payModalOrder.subtotal || 0),
        tax: Number(payModalOrder.tax || 0),
        total: orderTotal,
        discount: 0,
        dining: "takeaway",
        table: null,
        user, store, payment,
      });

      // Mark takeaway complete
      await api.put(`/takeaway/orders/${payModalOrder.id}/complete`, { payment_method: payment.payment_method }).catch(() => {});

      // 🔧 Check if printer is enabled before printing
      const printerEnabled = settings.printer && settings.printer.enabled;
      
      if (printerEnabled) {
        // Print receipt only (NO KOT — already printed on accept)
        const printResult = await printReceipt({
          items: cartItems,
          subtotal: Number(payModalOrder.subtotal || 0),
          tax: Number(payModalOrder.tax || 0),
          total: orderTotal,
          payment, store, settings,
          orderId: "TK-" + payModalOrder.id,
          dining: "takeaway",
          table: null,
          billNumber,
          customerName: payModalOrder.customer_name,
          customerPhone: payModalOrder.customer_phone,
          note: payModalOrder.note,
        });

        // 🔧 Show error if print failed
        if (!printResult.success) {
          console.error("Receipt print failed:", printResult.error);
          Alert.alert("⚠️ Print Warning", "Receipt could not print: " + (printResult.error || "Unknown error") + "\n\nOrder was saved successfully.");
        }
      } else {
        console.log("Printer disabled - skipping receipt print");
      }

      // Open cash drawer if enabled
      const cd = settings.cashDrawer || {};
      if (cd.enabled && cd.autoOnCash !== false && payment.payment_method === "cash") {
        try { const mod = await import("../services/printerService"); await mod.openCashDrawer(settings); } catch (e) {}
      }

      setPayModalOrder(null);
      Alert.alert("✅", "Takeaway #" + String(payModalOrder.id).padStart(4, "0") + " completed!");
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setProcessing(false);
    }
  };