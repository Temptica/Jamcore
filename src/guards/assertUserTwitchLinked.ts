import { Request, Response, NextFunction } from "express";

import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertUserTwitchLinked(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  if (!res.locals.user.twitchUserId) {
    next(new ForbiddenError("Connect your Twitch account first."));
    return;
  }

  next();
}

export default assertUserTwitchLinked;
