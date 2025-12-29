# Use official Node.js runtime as parent image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the application (Vite build)
RUN npm run build

# Expose the port the app runs on
ENV PORT=8080
# Optional: Set default API Key (prefer passing this at runtime via -e or Cloud Run secrets)
# ENV GEMINI_API_KEY=...
EXPOSE 8080

# Start the application using the server script
CMD [ "npm", "start" ]
