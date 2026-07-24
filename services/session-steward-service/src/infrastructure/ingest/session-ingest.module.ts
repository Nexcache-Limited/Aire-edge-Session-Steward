import { Module } from '@nestjs/common';

import { SessionStewardApplicationModule } from '../../application/session-steward-application.module';
import { DeploymentEventNormalizer } from './deployment-event.normalizer';
import { DeploymentEventsSubscriber } from './deployment-events.subscriber';
import { EvidenceEventNormalizer } from './evidence-event.normalizer';
import { EvidenceEventsSubscriber } from './evidence-events.subscriber';
import { NatsConnectionService } from './nats-connection.service';
import { QoeEventNormalizer } from './qoe-event.normalizer';
import { QoeEventsSubscriber } from './qoe-events.subscriber';
import { TelemetryEventNormalizer } from './telemetry-event.normalizer';
import { TelemetryEventsSubscriber } from './telemetry-events.subscriber';

@Module({
  imports: [SessionStewardApplicationModule],
  providers: [
    NatsConnectionService,
    DeploymentEventNormalizer,
    TelemetryEventNormalizer,
    QoeEventNormalizer,
    EvidenceEventNormalizer,
    DeploymentEventsSubscriber,
    TelemetryEventsSubscriber,
    QoeEventsSubscriber,
    EvidenceEventsSubscriber,
  ],
})
export class SessionIngestModule {}
