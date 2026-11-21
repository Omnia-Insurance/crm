import { Field, HideField, InputType, Int } from '@nestjs/graphql';

import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

@InputType()
export class CreateRoleInput {
  @IsUUID()
  @IsOptional()
  @Field({ nullable: true })
  id?: string;

  @HideField()
  universalIdentifier?: string;

  @IsString()
  @Field({ nullable: false })
  label: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  description?: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  icon?: string;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canUpdateAllSettings?: boolean;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canAccessAllTools?: boolean;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canAccessAllAgentChatChannels?: boolean;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canReadAllObjectRecords?: boolean;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canUpdateAllObjectRecords?: boolean;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canSoftDeleteAllObjectRecords?: boolean;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canDestroyAllObjectRecords?: boolean;

  // OMNIA-CUSTOM: role-wide sidebar default and policy edit window (C3, C4)
  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  showAllObjectsInSidebar?: boolean;

  @IsInt()
  @IsOptional()
  @Field(() => Int, { nullable: true })
  editWindowMinutes?: number | null;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canBeAssignedToUsers?: boolean;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canBeAssignedToAgents?: boolean;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  canBeAssignedToApiKeys?: boolean;
}
