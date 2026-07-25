import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, NatsConnection } from 'nats';

@Injectable()
export class NatsConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsConnectionService.name);
  private client?: NatsConnection;

  constructor(private readonly config: ConfigService) {}

  get connection(): NatsConnection | undefined {
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('NATS_ENABLED', 'false') !== 'true') {
      this.logger.log('NATS ingestion is disabled');
      return;
    }

    const servers = this.config.get<string>('NATS_URL');
    if (!servers && this.config.get<string>('NODE_ENV') === 'production') {
      throw new Error('NATS_URL is required when NATS_ENABLED=true in production.');
    }
    const resolvedServers = servers ?? 'nats://localhost:4222';
    try {
      this.client = await connect({ servers: resolvedServers });
      this.logger.log(`Connected to NATS at ${resolvedServers}`);
    } catch (error) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error(
          `NATS connection failed at ${resolvedServers}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
      this.logger.warn(
        `NATS unavailable at ${resolvedServers}; read APIs remain available. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.drain();
  }
}
