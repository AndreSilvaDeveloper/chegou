import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant, User } from '../../database/entities';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, User])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
