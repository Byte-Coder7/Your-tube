YourTube — Video Streaming Platform

A full-stack YouTube-inspired video streaming platform built with Next.js, React, Node.js, Express, MongoDB, and Firebase Authentication.

Features

- User authentication
- Video browsing and playback
- Comments, likes, history, and watch later
- Subscription plans and payment integration setup
- Video downloads and OTP verification UI
- Watch Party pages and real-time features

Tech Stack

Frontend: Next.js, React, TypeScript, Tailwind CSS
Backend: Node.js, Express.js
Database: MongoDB
Authentication: Firebase Authentication
Payments: Razorpay test integration setup

Run Locally

Backend

cd server
npm install
npm start

Frontend

Open another terminal:

cd yourtube
npm install
npm run dev

Frontend: "http://localhost:3000"

Backend: "http://localhost:5000"

Environment Variables

Create local environment files using the provided ".env.example" templates and add your own credentials. Never commit real ".env" files, passwords, API keys, or private keys.

Project Status

The frontend production build and backend entry-file syntax check have passed. Some integrations, including database availability, payments, email delivery, and Watch Party end-to-end behavior, still require verification.

Author

Developed as a full-stack video streaming project.