# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy all application files
COPY . .

# Create a health check file to verify deployment
RUN echo "v2.0-CORS-FIXED-$(date +%s)" > /app/deployment-version.txt

# Expose the port your app runs on
EXPOSE 8080

# Use node directly (not npm start) for better error handling
CMD ["node", "index.js"]