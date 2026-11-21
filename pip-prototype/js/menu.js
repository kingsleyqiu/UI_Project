/* Menu, prices and the store details used across the prototype. */
(function (root) {
  "use strict";

  const MENU = {
    store: { name: "Pip's Pizza", address: "123 King St W, Oshawa" },
    sizes: [
      { id: "Small", inches: 10, price: 11.99 },
      { id: "Medium", inches: 12, price: 14.99 },
      { id: "Large", inches: 14, price: 17.99 },
    ],
    crusts: ["Thin", "Hand-tossed"],
    toppings: ["Pepperoni", "Mushrooms", "Bell peppers", "Onions", "Extra cheese"],
    toppingPrice: 1.75,
    deliveryFee: 3.99,
    taxRate: 0.13,
    maxQuantity: 10,
    deliveryCities: ["Oshawa", "Whitby", "Ajax", "Pickering", "Courtice", "Bowmanville"],
    pickupMinutes: 20,
    deliveryMinutes: 40,
  };

  const round = (n) => Math.round(n * 100) / 100;

  /** Price breakdown for the order so far, or null until a size is chosen. */
  function price(order) {
    const size = MENU.sizes.find((s) => s.id === order.size);
    if (!size) return null;
    const toppingCount = Array.isArray(order.toppings) ? order.toppings.length : 0;
    const each = round(size.price + toppingCount * MENU.toppingPrice);
    const quantity = order.quantity || 1;
    const subtotal = round(each * quantity);
    const delivery = order.service === "Delivery" ? MENU.deliveryFee : 0;
    const tax = round((subtotal + delivery) * MENU.taxRate);
    return { each, quantity, subtotal, delivery, tax, total: round(subtotal + delivery + tax) };
  }

  const money = (n) => "$" + n.toFixed(2);

  root.PipMenu = { MENU, price, money };
})(typeof window !== "undefined" ? window : globalThis);
