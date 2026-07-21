import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { SessionsController } from './sessions.controller';
import { SessionsQueryService } from './sessions-query.service';

describe('SessionsController', () => {
  let app: INestApplication;
  const queries = {
    listActive: jest.fn().mockResolvedValue([{ id: 'session-1' }]),
    detail: jest.fn().mockResolvedValue({ id: 'session-1' }),
    timeline: jest.fn().mockResolvedValue([{ normalizedEventType: 'deployment.completed' }]),
    assessmentHistory: jest.fn().mockResolvedValue([{ state: 'progressing' }]),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [{ provide: SessionsQueryService, useValue: queries }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('requires tenant context', async () => {
    await request(app.getHttpServer()).get('/sessions').expect(400);
  });

  it('routes tenant-scoped session reads', async () => {
    const tenantId = '10000000-0000-4000-8000-000000000001';
    await request(app.getHttpServer())
      .get('/sessions')
      .set('x-tenant-id', tenantId)
      .expect(200);
    await request(app.getHttpServer())
      .get('/sessions/session-1')
      .set('x-tenant-id', tenantId)
      .expect(200);
    await request(app.getHttpServer())
      .get('/sessions/session-1/timeline')
      .set('x-tenant-id', tenantId)
      .expect(200);
    await request(app.getHttpServer())
      .get('/sessions/session-1/assessments?limit=10')
      .set('x-tenant-id', tenantId)
      .expect(200);

    expect(queries.listActive).toHaveBeenCalledWith(tenantId);
    expect(queries.detail).toHaveBeenCalledWith(tenantId, 'session-1');
    expect(queries.timeline).toHaveBeenCalledWith(tenantId, 'session-1');
    expect(queries.assessmentHistory).toHaveBeenCalledWith(tenantId, 'session-1', 10);
  });
});
