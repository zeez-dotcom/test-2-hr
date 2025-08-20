import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { HttpError } from "../errorHandler";

export const authRouter = Router();

authRouter.post("/login", passport.authenticate("local"), (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

export const ensureAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.isAuthenticated()) return next();
  next(new HttpError(401, "Unauthorized"));
};

authRouter.get("/api/me", (req, res) => {
  res.json(req.user);
});



