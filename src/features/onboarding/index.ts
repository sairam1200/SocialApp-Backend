import { GetOnboardingStatusController } from './status/status.endpoint';
import { GetOnboardingStatusQueryHandler } from './status/status.handler';
import { GetOnboardingStep1Controller } from './step1/get/get-step1.endpoint';
import { GetOnboardingStep1QueryHandler } from './step1/get/get-step1.handler';
import { UpdateOnboardingStep1Controller } from './step1/update/update-step1.endpoint';
import { OnboardingStep1CommandHandler } from './step1/update/update-step1.handler';
import { GetOnboardingStep2Controller } from './step2/get/get-step2.endpoint';
import { GetOnboardingStep2QueryHandler } from './step2/get/get-step2.handler';
import { UpdateOnboardingStep2Controller } from './step2/update/update-step2.endpoint';
import { OnboardingStep2CommandHandler } from './step2/update/update-step2.handler';
import { GetOnboardingStep3Controller } from './step3/get/get-step3.endpoint';
import { GetOnboardingStep3QueryHandler } from './step3/get/get-step3.handler';
import { UpdateOnboardingStep3Controller } from './step3/update/update-step3.endpoint';
import { OnboardingStep3CommandHandler } from './step3/update/update-step3.handler';
import { GetOnboardingStep4Controller } from './step4/get/get-step4.endpoint';
import { GetOnboardingStep4QueryHandler } from './step4/get/get-step4.handler';
import { UpdateOnboardingStep4Controller } from './step4/update/update-step4.endpoint';
import { OnboardingStep4CommandHandler } from './step4/update/update-step4.handler';
import { GetTopicsController } from './topics/topics.endpoint';
import { GetTopicsQueryHandler } from './topics/topics.handler';

const controllers = [
  GetOnboardingStep1Controller,
  UpdateOnboardingStep1Controller,
  GetOnboardingStep2Controller,
  UpdateOnboardingStep2Controller,
  GetOnboardingStep3Controller,
  UpdateOnboardingStep3Controller,
  GetOnboardingStep4Controller,
  UpdateOnboardingStep4Controller,
  GetOnboardingStatusController,
  GetTopicsController,
];

const handlers = [
  GetOnboardingStep1QueryHandler,
  OnboardingStep1CommandHandler,
  GetOnboardingStep2QueryHandler,
  OnboardingStep2CommandHandler,
  GetOnboardingStep3QueryHandler,
  OnboardingStep3CommandHandler,
  GetOnboardingStep4QueryHandler,
  OnboardingStep4CommandHandler,
  GetOnboardingStatusQueryHandler,
  GetTopicsQueryHandler,
];

const onboarding = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default onboarding;
