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

carsRouter.post("/", upload.none(), async (req, res, next) => {
  try {
    const { make, model, year, plateNumber } = req.body;
    if (!make || !model || !year || !plateNumber) {
      return next(new HttpError(400, "Missing required fields"));
    }
    const car: InsertCar = insertCarSchema.parse({
      make,
      model,
      year,
      plateNumber,
    });
    const newCar = await storage.createCar(car);
    res.status(201).json(newCar);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid car data", error.errors));
    }
    next(new HttpError(500, "Failed to create car"));
  }
});

carsRouter.put("/:id", async (req, res, next) => {
  try {
    const updates: Partial<InsertCar> = insertCarSchema
      .partial()
      .parse(req.body);
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

