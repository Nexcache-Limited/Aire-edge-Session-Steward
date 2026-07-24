import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';

import type {
  SessionEvidenceArtifact,
  SessionEvidenceKind,
  SessionEvidenceMetricSet,
} from '../domain/session-engine/session-types';
import { SessionEventEntity, SessionEvidenceEntity } from '../infrastructure/database/entities';

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : undefined;

const first = (source: Json, ...keys: string[]): unknown =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const number = (source: Json, ...keys: string[]): number | undefined => {
  const value = first(source, ...keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
};

const string = (source: Json, ...keys: string[]): string | undefined => {
  const value = first(source, ...keys);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const compact = (value: Json): Json =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

const evidenceKind: Partial<Record<string, SessionEvidenceKind>> = {
  'qoe.baseline.completed': 'baseline_qoe',
  'qoe.validation.completed': 'post_change_qoe',
  'qoe.comparison.generated': 'qoe_comparison',
  'qoe.recommendation.generated': 'promotion_recommendation',
  'evidence.recorded': 'artifact',
  'evidence.pack.updated': 'artifact',
  'evidence.citation.linked': 'citation',
  'evidence.note.attached': 'note',
};

@Injectable()
export class SessionEvidenceMapperService {
  constructor(
    @InjectRepository(SessionEvidenceEntity)
    private readonly evidence: Repository<SessionEvidenceEntity>,
  ) {}

  async extract(event: SessionEventEntity): Promise<SessionEvidenceEntity | undefined> {
    if (!event.sessionId) return undefined;
    const kind = evidenceKind[event.normalizedEventType];
    if (!kind) return undefined;

    const existing = await this.evidence.findOne({
      where: { sourceEventId: event.id, evidenceKind: kind },
    });
    if (existing) return existing;

    const metrics = compact(this.metrics(event.payload) as Json);
    const artifact = compact(this.artifact(event.payload) as Json);
    const freshnessExpiresAt = this.freshness(event);
    const candidate: DeepPartial<SessionEvidenceEntity> = {
        sessionId: event.sessionId,
        tenantId: event.tenantId,
        evidenceType: `objective.${kind}`,
        evidenceKind: kind,
        sourceService: event.sourceService,
        sourceEventId: event.id,
        sourceRef: event.sourceRef,
      metricSet: Object.keys(metrics).length > 0 ? metrics : null,
      artifact: Object.keys(artifact).length > 0 ? artifact : null,
        freshnessExpiresAt,
        recordedAt: event.occurredAt,
        value: event.payload,
      };
    return this.evidence.save(this.evidence.create(candidate));
  }

  private metrics(payload: Json): SessionEvidenceMetricSet {
    const source = asRecord(payload.metricSet) ?? asRecord(payload.metric_set) ?? asRecord(payload.metrics) ?? payload;
    const tier = string(source, 'bandwidthTier', 'bandwidth_tier');
    return {
      qoeScore: number(source, 'qoeScore', 'qoe_score'),
      packetLossPct: number(source, 'packetLossPct', 'packet_loss_pct'),
      latencyMs: number(source, 'latencyMs', 'latency_ms'),
      jitterMs: number(source, 'jitterMs', 'jitter_ms'),
      bandwidthTier:
        tier === 'low' || tier === 'medium' || tier === 'high' ? tier : undefined,
      bandwidthTiers: number(source, 'bandwidthTiers', 'bandwidth_tiers'),
      cohortPct: number(source, 'cohortPct', 'cohort_pct'),
      comparisonDeltaPct: number(
        source,
        'comparisonDeltaPct',
        'comparison_delta_pct',
        'qoeImprovementPct',
        'qoe_improvement_pct',
      ),
    };
  }

  private artifact(payload: Json): SessionEvidenceArtifact {
    const source = asRecord(payload.artifact) ?? payload;
    return {
      artifactType: string(source, 'artifactType', 'artifact_type', 'packageType', 'package_type'),
      uri: string(source, 'uri', 'url', 'downloadUrl', 'download_url', 's3Key', 's3_key'),
      title: string(source, 'title', 'name'),
      citationKey: string(source, 'citationKey', 'citation_key'),
    };
  }

  private freshness(event: SessionEventEntity): Date | null {
    const explicit = string(
      event.payload,
      'freshnessExpiresAt',
      'freshness_expires_at',
      'expiresAt',
      'expires_at',
    );
    if (explicit && !Number.isNaN(Date.parse(explicit))) return new Date(explicit);
    return event.sourceService === 'qoe-service'
      ? new Date(event.occurredAt.getTime() + 15 * 60_000)
      : null;
  }
}
