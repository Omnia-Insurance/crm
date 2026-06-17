import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TelephonyCallSessionDTO {
  @Field()
  callSessionId: string;

  @Field()
  provider: string;

  @Field({ nullable: true })
  providerCallId?: string | null;

  @Field()
  status: string;

  @Field({ nullable: true })
  instruction?: string | null;
}
