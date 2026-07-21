import { Module } from '@nestjs/common';

import { SessionStewardApplicationModule } from '../../application/session-steward-application.module';
import { DeploymentEventNormalizer } from './deployment-event.normalizer';
import { DeploymentEventsSubscriber } from './deployment-events.subscriber';
import { NatsConnectionService } from './nats-connection.service';
import { TelemetryEventNormalizer } from './telemetry-event.normalizer';
import { TelemetryEventsSubscriber } from './telemetry-events.subscriber';

@Module({
  imports: [SessionStewardApplicationModule],
  providers: [
    NatsConnectionService,
    DeploymentEventNormalizer,
    TelemetryEventNormalizer,
    DeploymentEventsSubscriber,
    TelemetryEventsSubscriber,
  ],
})
export class SessionIngestModule {}
