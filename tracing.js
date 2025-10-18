// tracing.js - OpenTelemetry + Logfire setup for LLM call instrumentation
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OpenAIInstrumentation } = require('@traceloop/instrumentation-openai');
const logfire = require('logfire');

// Configure Logfire
logfire.configure({
  token: process.env.LOGFIRE_TOKEN,
  serviceName: 'calorie-bot',
  serviceVersion: '2.1',
});

// Initialize OpenTelemetry SDK with instrumentations
const sdk = new NodeSDK({
  instrumentations: [
    // Auto-instrument OpenAI API calls
    new OpenAIInstrumentation({
      // Capture full prompts and responses for debugging
      captureMessageContent: true,
    }),

    // Auto-instrument Express, HTTP, and other common Node.js libraries
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-express': {
        enabled: true
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true
      },
      '@opentelemetry/instrumentation-fs': {
        enabled: false // Don't trace file system for performance
      },
    }),
  ],
});

// Start SDK
sdk.start();

console.log('✅ OpenTelemetry + Logfire tracing initialized');
console.log('📊 Traces will be sent to Logfire dashboard');

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('📊 Tracing terminated'))
    .catch((error) => console.error('❌ Error terminating tracing', error))
    .finally(() => process.exit(0));
});

module.exports = { logfire };
