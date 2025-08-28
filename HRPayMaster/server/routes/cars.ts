import { Router } from "express";
import multer from "multer";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import { insertCarSchema, type InsertCar } from "@shared/schema";
import { z } from "zod";

const upload = multer();
export const carsRouter = Router();

carsRouter.get("/", async (req, res, next) => {
  try {
    const cars = await storage.getCars();
    res.json(cars);
  } catch (error) {
    next(new HttpError(500, "Failed to fetch cars"));
  }
});

carsRouter.get("/:id", async (req, res, next) => {
  try {
    const car = await storage.getCar(req.params.id);
    if (!car) {
      return next(new HttpError(404, "Car not found"));
    }
    res.json(car);
  } catch (error) {
    next(new HttpError(500, "Failed to fetch car"));
  }
});

carsRouter.post(
  "/",
  upload.any(),
  async (req, res, next) => {
    try {
      console.log("content-type", req.headers["content-type"]);
      console.log("body", req.body);
      console.log("files", req.files);

      const normalizedBody: Record<string, any> = { ...(req.body ?? {}) };

      // Rename legacy field if provided
      if (normalizedBody.licensePlate && !normalizedBody.plateNumber) {
        normalizedBody.plateNumber = normalizedBody.licensePlate;
        delete normalizedBody.licensePlate;
      }

      // Convert numeric strings to numbers
      for (const field of ["year", "mileage", "purchasePrice"]) {
        if (typeof normalizedBody[field] === "string" && normalizedBody[field] !== "") {
          const num = Number(normalizedBody[field]);
          if (!Number.isNaN(num)) {
            normalizedBody[field] = num;
          }
        }
      }

      const files = req.files as Express.Multer.File[] | undefined;
      const regDoc = files?.find(f => f.fieldname === "registrationDocumentImage");
      if (regDoc) {
        normalizedBody.registrationDocumentImage = `data:${regDoc.mimetype};base64,${regDoc.buffer.toString("base64")}`;
      }

      const car: InsertCar = insertCarSchema.parse(normalizedBody);
      const newCar = await storage.createCar(car);
      res.status(201).json(newCar);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid car data", error.errors));
      }
      next(new HttpError(500, "Failed to create car"));
    }
  }
);

carsRouter.put("/:id", upload.any(), async (req, res, next) => {
  try {
    const normalizedBody: Record<string, any> = { ...(req.body ?? {}) };

    const files = req.files as Express.Multer.File[] | undefined;
    const regDoc = files?.find(f => f.fieldname === "registrationDocumentImage");
    if (regDoc) {
      normalizedBody.registrationDocumentImage = `data:${regDoc.mimetype};base64,${regDoc.buffer.toString("base64")}`;
    } else if (
      typeof normalizedBody.registrationDocumentImage === "string" &&
      normalizedBody.registrationDocumentImage !== "" &&
      !normalizedBody.registrationDocumentImage.startsWith("data:")
    ) {
      normalizedBody.registrationDocumentImage = `data:image/*;base64,${normalizedBody.registrationDocumentImage}`;
    }

    const updates: Partial<InsertCar> = insertCarSchema.partial().parse(normalizedBody);
    const updatedCar = await storage.updateCar(req.params.id, updates);
    if (!updatedCar) {
      return next(new HttpError(404, "Car not found"));
    }
    res.json(updatedCar);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid car data", error.errors));
    }
    next(new HttpError(500, "Failed to update car"));
  }
});

carsRouter.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await storage.deleteCar(req.params.id);
    if (!deleted) {
      return next(new HttpError(404, "Car not found"));
    }
    res.status(204).send();
  } catch (error) {
    next(new HttpError(500, "Failed to delete car"));
  }
});
