import { ApiProperty } from "@nestjs/swagger";
import { OnboardingStep } from "../enums";

export class OnboardingStep1Model {
  @ApiProperty({ required: false, nullable: true })
  profileImage?: string;

  @ApiProperty({ required: false, nullable: true })
  username?: string;

  @ApiProperty({ required: false, nullable: true })
  bio?: string;

  constructor(request: Partial<OnboardingStep1Model> = {}) {
    Object.assign(this, request);
  }
}

export class OnboardingStep2Model {
  @ApiProperty({ type: [String], description: 'Array of topic IDs' })
  topicIds: string[];

  constructor(request: Partial<OnboardingStep2Model> = {}) {
    Object.assign(this, request);
  }
}

export class OnboardingStatusModel {
  @ApiProperty({ enum: OnboardingStep })
  currentStep: OnboardingStep;

  @ApiProperty()
  isCompleted: boolean;

  @ApiProperty({ required: false })
  accessToken?: string;

  constructor(request: Partial<OnboardingStatusModel> = {}) {
    Object.assign(this, request);
  }
}

export class TopicModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false, nullable: true })
  description?: string;

  @ApiProperty({ required: false, nullable: true })
  icon?: string;

  @ApiProperty()
  isActive: boolean;

  constructor(request: Partial<TopicModel> = {}) {
    Object.assign(this, request);
  }
}

export class OnboardingStep4Model {
  @ApiProperty({ required: false, nullable: true })
  profileImage?: string;

  @ApiProperty({ required: false, nullable: true })
  username?: string;

  @ApiProperty({ required: false, nullable: true })
  bio?: string;

  @ApiProperty({ type: [Object], description: 'Array of selected topics' })
  topics: Array<{ id: string; name: string }>;

  @ApiProperty()
  confirmed: boolean;

  constructor(request: Partial<OnboardingStep4Model> = {}) {
    Object.assign(this, request);
  }
}
