# System Design

## Architecture

The application runs entirely in the browser.

User Input
    -> Natural Language Processing
    -> Order State and Validation
    -> Interface and Order Summary
    -> Spoken and Visual Feedback

## Components

| Component | Responsibility |
|---|---|
| app.js | Conversation flow and order state |
| menu.js | Menu, pricing, tax and delivery configuration |
| nlu.js | Intent recognition and order detail extraction |
| voice.js | Speech recognition and synthesis |
| styles.css | Layout, animations and accessibility |

## Delivery and Pickup

Pickup orders use a simulated preparation time of 20 minutes.
Delivery orders use a simulated arrival time of 40 minutes.

Supported delivery areas include Oshawa, Whitby, Ajax,
Pickering, Courtice and Bowmanville.

## Error Recovery

The interface handles unsupported toppings, invalid payments,
incomplete addresses, unsupported delivery locations and
speech-recognition failures while retaining valid order details.

## Limitations

- No real payment processing
- No restaurant backend
- No live traffic or delivery tracking
- Voice recognition depends on browser support
