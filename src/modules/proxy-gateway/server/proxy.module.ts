import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { AccountLeaseService } from './account-lease.service';
import { GeminiClient } from './clients/gemini.client';
import { GeminiController } from './gemini.controller';
import { ProxyGuard } from './proxy.guard';

@Module({
  imports: [],
  controllers: [ProxyController, GeminiController],
  providers: [ProxyService, AccountLeaseService, GeminiClient, ProxyGuard],
  exports: [AccountLeaseService],
})
export class ProxyModule {}
