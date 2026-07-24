import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';

import { SessionsQueryService } from './sessions-query.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly queries: SessionsQueryService) {}

  @Get()
  list(@Headers('x-tenant-id') tenantId?: string) {
    return this.queries.listActive(this.requireTenant(tenantId));
  }

  @Get(':id')
  detail(@Headers('x-tenant-id') tenantId: string | undefined, @Param('id') id: string) {
    return this.queries.detail(this.requireTenant(tenantId), id);
  }

  @Get(':id/timeline')
  timeline(@Headers('x-tenant-id') tenantId: string | undefined, @Param('id') id: string) {
    return this.queries.timeline(this.requireTenant(tenantId), id);
  }

  @Get(':id/assessments')
  assessments(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('id') id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.queries.assessmentHistory(this.requireTenant(tenantId), id, limit);
  }

  @Get(':id/evidence')
  evidence(@Headers('x-tenant-id') tenantId: string | undefined, @Param('id') id: string) {
    return this.queries.evidenceList(this.requireTenant(tenantId), id);
  }

  private requireTenant(tenantId?: string): string {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required');
    return tenantId;
  }
}
