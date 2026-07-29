import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

describe('ContractsController', () => {
  let app: INestApplication;
  const contracts = {
    listTemplates: jest.fn().mockResolvedValue([{ id: 'template-1' }]),
    createTemplate: jest.fn().mockResolvedValue({ id: 'template-1' }),
    templateDetail: jest.fn().mockResolvedValue({ id: 'template-1' }),
    assign: jest.fn().mockResolvedValue({ contract: { id: 'contract-2' } }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContractsController],
      providers: [{ provide: ContractsService, useValue: contracts }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('creates, lists, reads, and assigns tenant-scoped templates', async () => {
    const tenantId = '10000000-0000-4000-8000-000000000001';
    const definition = {
      name: 'Essex QoE promotion',
      steps: [
        {
          key: 'baseline',
          title: 'Capture baseline',
          expectedEventType: 'qoe.baseline.completed',
        },
      ],
    };
    await request(app.getHttpServer())
      .post('/contract-templates')
      .set('x-tenant-id', tenantId)
      .set('x-operator-email', 'operator@nexcache.com')
      .send(definition)
      .expect(201);
    await request(app.getHttpServer())
      .get('/contract-templates')
      .set('x-tenant-id', tenantId)
      .expect(200);
    await request(app.getHttpServer())
      .get('/contract-templates/template-1')
      .set('x-tenant-id', tenantId)
      .expect(200);
    await request(app.getHttpServer())
      .post('/sessions/session-1/contract')
      .set('x-tenant-id', tenantId)
      .send({ templateId: 'template-1', replaceExisting: true })
      .expect(201);

    expect(contracts.createTemplate).toHaveBeenCalledWith(
      tenantId,
      definition,
      'operator@nexcache.com',
    );
    expect(contracts.assign).toHaveBeenCalledWith(tenantId, 'session-1', {
      templateId: 'template-1',
      replaceExisting: true,
    });
  });

  it('rejects missing tenant context', async () => {
    await request(app.getHttpServer()).get('/contract-templates').expect(400);
  });
});
