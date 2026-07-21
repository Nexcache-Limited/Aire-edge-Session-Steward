import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StringCodec, Subscription } from 'nats';

import { SessionEventsService } from '../../application/session-events.service';
import { NatsConnectionService } from './nats-connection.service';
import { TelemetryEventNormalizer } from './telemetry-event.normalizer';

@Injectable()
export class TelemetryEventsSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryEventsSubscriber.name);
  private readonly codec = StringCodec();
  private subscription?: Subscription;
  private consumer?: Promise<void>;

  constructor(
    private readonly nats: NatsConnectionService,
    private readonly config: ConfigService,
    private readonly normalizer: TelemetryEventNormalizer,
    private readonly events: SessionEventsService,
  ) {}

  onModuleInit(): void {
    if (!this.nats.connection) return;
    const subject = this.config.get<string>(
      'NATS_TELEMETRY_SUBJECT',
      'aire.telemetry.events',
    );
    this.subscription = this.nats.connection.subscribe(subject);
    this.consumer = this.consume(this.subscription);
    this.logger.log(`Subscribed to ${subject}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.subscription?.unsubscribe();
    await this.consumer;
  }

  private async consume(subscription: Subscription): Promise<void> {
    for await (const message of subscription) {
      try {
        const value: unknown = JSON.parse(this.codec.decode(message.data));
        await this.events.ingest(this.normalizer.normalize(value));
      } catch (error) {
        this.logger.warn(
          `Rejected telemetry event: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
