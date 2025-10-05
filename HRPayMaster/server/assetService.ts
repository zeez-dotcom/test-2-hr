import {
  type AssetAssignmentWithDetails,
  type InsertAsset,
  type InsertAssetAssignment,
} from "@shared/schema";
import { storage } from "./storage";

let assetAssignmentsCache: Promise<AssetAssignmentWithDetails[]> | null = null;

const loadAssetAssignments = async () => storage.getAssetAssignments();

const invalidateAssetAssignmentsCache = () => {
  assetAssignmentsCache = null;
};

export const assetService = {
  getAssets: () => storage.getAssets(),
  getAsset: (id: string) => storage.getAsset(id),
  createAsset: (asset: InsertAsset) => storage.createAsset(asset),
  updateAsset: (id: string, asset: Partial<InsertAsset>) => storage.updateAsset(id, asset),
  deleteAsset: (id: string) => storage.deleteAsset(id),
  getAssignments: async () => {
    if (!assetAssignmentsCache) {
      assetAssignmentsCache = loadAssetAssignments();
    }
    return assetAssignmentsCache;
  },
  getAssignment: (id: string) => storage.getAssetAssignment(id),
  createAssignment: async (assignment: InsertAssetAssignment) => {
    invalidateAssetAssignmentsCache();
    return storage.createAssetAssignment(assignment);
  },
  updateAssignment: async (
    id: string,
    assignment: Partial<InsertAssetAssignment>,
  ) => {
    invalidateAssetAssignmentsCache();
    return storage.updateAssetAssignment(id, assignment);
  },
  deleteAssignment: async (id: string) => {
    invalidateAssetAssignmentsCache();
    return storage.deleteAssetAssignment(id);
  },
  invalidateAssignmentCache: invalidateAssetAssignmentsCache,
};
