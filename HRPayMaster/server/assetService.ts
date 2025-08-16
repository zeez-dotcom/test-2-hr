import { InsertAsset, InsertAssetAssignment } from "@shared/schema";
import { storage } from "./storage";

export const assetService = {
  getAssets: () => storage.getAssets(),
  getAsset: (id: string) => storage.getAsset(id),
  createAsset: (asset: InsertAsset) => storage.createAsset(asset),
  updateAsset: (id: string, asset: Partial<InsertAsset>) => storage.updateAsset(id, asset),
  deleteAsset: (id: string) => storage.deleteAsset(id),
  getAssignments: () => storage.getAssetAssignments(),
  getAssignment: (id: string) => storage.getAssetAssignment(id),
  createAssignment: (assignment: InsertAssetAssignment) => storage.createAssetAssignment(assignment),
  updateAssignment: (id: string, assignment: Partial<InsertAssetAssignment>) => storage.updateAssetAssignment(id, assignment),
  deleteAssignment: (id: string) => storage.deleteAssetAssignment(id),
};
