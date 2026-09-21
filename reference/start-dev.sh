#!/bin/bash

# Start Firebase Emulators in background
echo "Starting Firebase emulators..."
firebase emulators:start --only firestore,ui &
FIREBASE_PID=$!

# Wait for emulators to be ready
echo "Waiting for Firebase emulators to start..."
sleep 5

# Start the Quarkus app in dev mode
echo "Starting Quarkus application in dev mode..."
cd smart-factory-backend
./mvnw quarkus:dev -Dquarkus.profile=dev

# Cleanup function
cleanup() {
    echo "Stopping Firebase emulators..."
    kill $FIREBASE_PID 2>/dev/null
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

wait