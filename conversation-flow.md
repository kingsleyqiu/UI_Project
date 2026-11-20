# Typed pickup conversation

Update the order summary after each accepted answer. Ask for explicit confirmation once the complete order is visible.

## Complete a pickup order

| Step | Avatar | Customer |
| --- | --- | --- |
| Welcome and fulfillment | Hi! I can help you order a pizza. Would you like pickup or delivery? | Pickup. |
| Size | Would you like a small, medium, or large pizza? | Medium. |
| Crust | Would you like thin or hand-tossed crust? | Thin crust. |
| Toppings | Which toppings would you like? We have pepperoni, mushrooms, and bell peppers. | Pepperoni. |
| Quantity | How many of this pizza would you like? | One. |
| Simulated payment | Would you like to use a demo card or select cash at pickup? | Demo card. |
| Review | You have one medium thin-crust pepperoni pizza for pickup with demo card as the payment method. Would you like to confirm or edit? | Confirm order. |
| Complete | Simulated order confirmed. One medium thin-crust pepperoni pizza for pickup. | |

## Retry an unsupported topping

Start at the toppings question, after the customer has selected pickup, medium, and thin crust.

| Step | Avatar | Customer |
| --- | --- | --- |
| Toppings | Which toppings would you like? We have pepperoni, mushrooms, and bell peppers. | Anchovies. |
| Retry | Anchovies are unavailable. Would you like pepperoni, mushrooms, or bell peppers? | Pepperoni. |

During the retry, the summary shows pickup, medium, and thin crust, with toppings awaiting a valid answer. After accepting pepperoni, continue to quantity.

## Change the size at review

Start with the complete medium pizza order on the review screen.

| Step | Avatar | Customer |
| --- | --- | --- |
| Review | Would you like to confirm or edit? | Change the size. |
| Edit size | Would you like small, medium, or large? | Large. |
| Review the update | You have one large thin-crust pepperoni pizza for pickup with demo card as the payment method. Would you like to confirm or edit? | Confirm order. |
| Complete | Simulated order confirmed. One large thin-crust pepperoni pizza for pickup. | |
