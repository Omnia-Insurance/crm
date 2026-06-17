import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TelephonyNextCampaignLeadDTO {
  @Field()
  campaignLeadId: string;

  @Field({ nullable: true })
  leadId?: string | null;

  @Field({ nullable: true })
  campaignId?: string | null;

  @Field()
  lockExpiresAt: string;

  @Field({ nullable: true })
  blockedReason?: string | null;
}
