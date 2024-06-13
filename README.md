# Sarajevo Tram Tracking System

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technologies Used](#technologies-used)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Overview

The Sarajevo Tram Tracking System is a real-time tram tracking application developed for tracking trams in Sarajevo. This application provides real-time information about tram locations to help commuters stay informed and plan their journeys more effectively.

## Features

- Real-time tram location tracking
- Search functionality for tram stations
- WebSocket connection for live updates
- Notification alerts for stationary trams
- Bug reporting feature
- Mobile-responsive design

## Technologies Used

- HTML, CSS, JavaScript
- Node.js, Express.js
- PostgreSQL
- WebSocket
- Leaflet.js for interactive maps
- Axios for HTTP requests

## Installation

### Prerequisites

- Node.js and npm installed
- PostgreSQL installed and running
- Create a `.env` file in the project root with the following content:
  ```
  EMAIL_USER=your-email@example.com
  EMAIL_PASS=your-email-password
  ```

### Steps

1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/sarajevo-tram-tracking.git
   cd sarajevo-tram-tracking
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. Set up the PostgreSQL database:
   ```sh
   psql -U postgres -c "CREATE DATABASE trackingDB;"
   psql -U postgres -d trackingDB -f database.sql
   ```

4. Start the server:
   ```sh
   node server.js
   ```

## Usage

1. Open `index.html` in a web browser to view the tram tracking map.
2. Use the search bar to find tram stations.
3. Open `about-us.html` to learn more about the project and report bugs.

## Project Structure

```
sarajevo-tram-tracking/
├── backend/
│   ├── db.js                     # Database connection configuration
│   ├── server.js                 # Express server setup and API endpoints
│   └── .env                      # Environment variables
├── frontend/
│   ├── assets/                   # Static assets (images, icons, etc.)
│   ├── styles.css                # Main CSS file
│   ├── about-us.css              # CSS file for the About Us page
│   ├── index.html                # Main HTML file for the tram tracking map
│   ├── about-us.html             # HTML file for the About Us page
│   ├── app.js                    # Main application logic
│   └── bug-report.js             # Bug report submission logic
├── movement simulation/
│   └── simulate-tram.js          # Script to simulate tram movement
├── database.sql                  # SQL script to set up the database
└── README.md                     # Project documentation
```
