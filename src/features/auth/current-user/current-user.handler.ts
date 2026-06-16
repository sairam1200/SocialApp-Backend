import { Globals } from "../../../core/globals";
import { HttpContext } from "../../../core/middlewares/httpContext.middleware";

import {
  IQueryHandler,
  QueryHandler
} from "@nestjs/cqrs";

export class CurrentUserQuery {
  constructor(
    request: Partial<CurrentUserQuery> = {}
  ) {
    Object.assign(this, request);
  }
}

@QueryHandler(CurrentUserQuery)
export class CurrentUserQueryHandler
  implements IQueryHandler<CurrentUserQuery>
{
  async execute(): Promise<any> {
    const user = HttpContext.user;

    if (!user) {
      return {
        succeeded: false,
        message: "Unauthorized",
      };
    }

    return {
      id: user[
        Globals.ClaimTypes.UserId
      ],
      email: user[
        Globals.ClaimTypes.Email
      ],
      firstName: user[
        Globals.ClaimTypes.GivenName
      ],
      lastName: user[
        Globals.ClaimTypes.FamilyName
      ],
      fullName: user[
        Globals.ClaimTypes.FullName
      ],
      onboardingStep:
        user.onboardingStep,
    };
  }
}