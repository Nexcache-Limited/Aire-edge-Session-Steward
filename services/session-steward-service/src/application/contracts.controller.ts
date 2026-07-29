import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';

import {
  AssignContractInput,
  ContractsService,
  CreateContractTemplateInput,
} from './contracts.service';

@Controller()
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get('contract-templates')
  list(@Headers('x-tenant-id') tenantId?: string) {
    return this.contracts.listTemplates(this.requireTenant(tenantId));
  }

  @Post('contract-templates')
  create(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Headers('x-operator-email') operator: string | undefined,
    @Body() input: CreateContractTemplateInput,
  ) {
    return this.contracts.createTemplate(this.requireTenant(tenantId), input, operator);
  }

  @Get('contract-templates/:id')
  detail(@Headers('x-tenant-id') tenantId: string | undefined, @Param('id') id: string) {
    return this.contracts.templateDetail(this.requireTenant(tenantId), id);
  }

  @Post('sessions/:id/contract')
  assign(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Param('id') id: string,
    @Body() input: AssignContractInput,
  ) {
    return this.contracts.assign(this.requireTenant(tenantId), id, input);
  }

  private requireTenant(tenantId?: string): string {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required');
    return tenantId;
  }
}
