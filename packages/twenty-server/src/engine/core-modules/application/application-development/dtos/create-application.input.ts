import { Field, InputType } from '@nestjs/graphql';

// Backward-compatible input type for twenty-sdk@0.6.3-alpha which sends
// createOneApplication(input: CreateApplicationInput!) instead of
// createDevelopmentApplication(universalIdentifier, name)
@InputType()
export class CreateApplicationInput {
  @Field(() => String)
  universalIdentifier: string;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  version?: string;

  @Field(() => String, { nullable: true })
  sourcePath?: string;
}
