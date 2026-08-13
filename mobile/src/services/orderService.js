import { addOfflineOrder } from "./offlineQueue";

function generateClientOrderId() {
  const timestamp = Date.now();
  const random = Math.random().toString(16).slice(2, 10);
  return timestamp + "-" + random;
}

export async function createOrder({ cart, subtotal, tax, total, discount, dining, table, user, store, payment }) {
  if (!cart || cart.length === 0) throw new Error("Cart is empty.");
  if (!user || !user.id) throw new Error("User is not logged in.");
  if (!store || !store.id) throw new Error("Store is not selected.");

  const paymentMethod = payment?.payment_method || "cash";

  const amountTendered =
    payment?.amount_tendered === undefined || payment?.amount_tendered === null
      ? total
      : Number(payment.amount_tendered);

  const changeDue =
    payment?.change_due === undefined || payment?.change_due === null
      ? 0
      : Number(payment.change_due);

  const payments =
    payment?.payments && Array.isArray(payment.payments)
      ? payment.payments
      : [{ method: paymentMethod, amount: total }];

  const order = {
    client_order_id: generateClientOrderId(),
    store_id: store.id,
    cashier_id: user.id,
    subtotal,
    tax_amount: tax,
    total_amount: total,
	discount_amount: discount || 0,
	dining_option: dining || "dine_in",
    status: "completed",
    created_at: new Date().toISOString(),
    payment_method: paymentMethod,
    amount_tendered: amountTendered,
    change_due: changeDue,
    payments,
    items: cart.map((item) => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
      modifiers: item.modifiers || [],
    })),
  };

  await addOfflineOrder(order);

  return order;
}
