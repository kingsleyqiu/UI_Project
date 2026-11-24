# Pip's Pizza — Interactive Ordering Assistant

A conversational pizza ordering website supporting voice, text,
and interactive controls.

**Ontario Tech University**  
SOFE 4850U — User Interface and Experience Design  
Fall 2026 | Group 10

## Overview

Pip guides customers through the pizza ordering process using
a conversational interface, live order summary, and simulated checkout.

## Features

- Voice recognition and spoken responses
- Text input and suggested responses
- Hands-free ordering
- Natural language processing
- Pickup and delivery options
- Real-time order summary and pricing
- Address validation and error recovery
- Individual order modifications
- Simulated payment and order confirmation
- Estimated pickup and delivery times
- Keyboard accessibility and reduced-motion support

## Getting Started

No external dependencies or build process are required.

Clone the repository:

    git clone https://github.com/kingsleyqiu/UI_Project.git
    cd UI_Project/pip-prototype

Start the local server:

    python3 -m http.server 8765 --bind 127.0.0.1

Open http://localhost:8765 in Google Chrome.

Allow microphone access to enable voice interaction.
Voice recognition requires an internet connection.

## Technologies

| Technology | Purpose |
|---|---|
| HTML5 | Website structure |
| CSS3 | Styling and animations |
| JavaScript | Application logic |
| Web Speech API | Speech recognition and synthesis |
| Natural Language Processing | Intent and order extraction |
| Node.js | Automated unit testing |
| Figma | Interface design |

## Project Structure

    UI_Project/
    ├── README.md
    ├── .gitignore
    ├── docs/
    ├── screenshots/
    └── pip-prototype/
        ├── index.html
        ├── css/
        │   └── styles.css
        ├── js/
        │   ├── app.js
        │   ├── menu.js
        │   ├── nlu.js
        │   └── voice.js
        ├── tests/
        │   └── nlu.test.js
        ├── conversation-flow.md
        └── README.md

## Testing

Run the natural language processing tests using Node.js 18 or later:

    cd pip-prototype
    node --test tests/nlu.test.js

## Documentation

- [Prototype Documentation](pip-prototype/README.md)
- [Conversation Flow and Demo Script](pip-prototype/conversation-flow.md)
- [System Design](docs/system-design.md)
- [Original Project Scope (Historical)](docs/original-project-scope.md)
- [Figma Design](https://www.figma.com/design/jpanhlrVfSLkbHgu6wJa6c?node-id=2-80)

## Team

- Aryan Kumar
- Qian Qiu
- Mohit Gajula

## Development Workflow

Changes are developed on individual branches and integrated
into main through pull requests.

## Disclaimer

This application is an academic prototype. Payments, order
processing, and delivery estimates are simulated.
