import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'aire-edge-session-steward-service',
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
