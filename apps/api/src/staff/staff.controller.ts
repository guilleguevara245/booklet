import { Body, Controller, Get, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import {
  createStaffSchema,
  setScheduleSchema,
  setStaffServicesSchema,
  updateStaffSchema,
  type CreateStaff,
  type ScheduleRule,
  type SetSchedule,
  type SetStaffServices,
  type Staff,
  type UpdateStaff,
} from '@booklet/shared';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { StaffService } from './staff.service.js';

@Controller('businesses/:businessId/staff')
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get()
  list(@Param('businessId', UuidPipe) businessId: string): Promise<Staff[]> {
    return this.staff.list(businessId);
  }

  @Post()
  create(
    @Param('businessId', UuidPipe) businessId: string,
    @Body(new ZodPipe(createStaffSchema)) body: CreateStaff,
  ): Promise<Staff> {
    return this.staff.create(businessId, body);
  }

  @Get(':id')
  get(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
  ): Promise<Staff> {
    return this.staff.get(businessId, id);
  }

  @Patch(':id')
  update(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateStaffSchema)) body: UpdateStaff,
  ): Promise<Staff> {
    return this.staff.update(businessId, id, body);
  }

  @Put(':id/services')
  setServices(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(setStaffServicesSchema)) body: SetStaffServices,
  ): Promise<Staff> {
    return this.staff.setServices(businessId, id, body.serviceIds);
  }

  @Get(':id/schedule')
  getSchedule(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
  ): Promise<ScheduleRule[]> {
    return this.staff.getSchedule(businessId, id);
  }

  @Put(':id/schedule')
  setSchedule(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(setScheduleSchema)) body: SetSchedule,
  ): Promise<ScheduleRule[]> {
    return this.staff.setSchedule(businessId, id, body);
  }
}
