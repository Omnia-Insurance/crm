import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TelephonySessionDTO {
  @Field()
  sessionId: string;

  @Field()
  status: string;

  @Field({ nullable: true })
  agentProfileId?: string | null;

  @Field({ nullable: true })
  accessToken?: string | null;

  @Field({ nullable: true })
  provider?: string | null;

  @Field({ nullable: true })
  expiresAt?: string | null;
}
