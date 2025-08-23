import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { HttpError } from "../errorHandler";

export const authRouter = Router();

authRouter.post("/login", (req, res, next) => {
  passport.authenticate(
    "local",
    (err: unknown, user: Express.User | false, info: unknown) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      req.logIn(user, (err: unknown) => {
        if (err) return next(err);
        res.json({ user });
      });
    },
  )(req, res, next);
});

authRouter.post("/logout", (req, res, next) => {
  req.logout((err: unknown) => {
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



